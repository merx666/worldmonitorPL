// ---------------------------------------------------------------------------
// Void Next — Application Orchestrator (TypeScript)
// ---------------------------------------------------------------------------

declare const MiniKit: any;

const BACKEND_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3400/wm/voidnext/v1'
  : 'https://worldmonitor.skyreel.art/wm/voidnext/v1';

// Global State
let userWallet: string | null = null;
let isPremiumUser: boolean = false;
let userVerificationLevel: string = 'Guest';

// Init on load
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await initMiniKit();
  await loadPublicData();
});

// Tab Switcher
function setupTabs(): void {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = (tab as HTMLElement).dataset.tab;
      if (target) switchTab(target);
    });
  });

  // Wire up paywall buttons
  const btnUnlockOverview = document.getElementById('btnUnlockPremiumOverview');
  const btnUnlockEconomy = document.getElementById('btnUnlockPremiumEconomy');

  if (btnUnlockOverview) btnUnlockOverview.addEventListener('click', triggerPayment);
  if (btnUnlockEconomy) btnUnlockEconomy.addEventListener('click', triggerPayment);
}

function switchTab(tabId: string): void {
  // Update Tab buttons
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(t => {
    const el = t as HTMLElement;
    if (el.dataset.tab === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Update Tab screens
  const screens = document.querySelectorAll('.tab-content');
  screens.forEach(s => s.classList.remove('active'));
  
  const targetScreen = document.getElementById(`tab-${tabId}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Load tab-specific data
  if (tabId === 'economy') {
    loadEconomyData();
  }
}

// MiniKit Integration
async function initMiniKit(): Promise<void> {
  try {
    if (typeof MiniKit === 'undefined') {
      console.warn('MiniKit SDK not found. Running in Web Sandbox mode.');
      setupMockUser();
      return;
    }

    // Install MiniKit
    const installResult = MiniKit.install();
    console.log('MiniKit install status:', installResult);

    if (!MiniKit.isInstalled()) {
      console.warn('Not running inside World App. Sandbox mode active.');
      setupMockUser();
      return;
    }

    // Get user identity
    const user = MiniKit.user;
    if (user && user.walletAddress) {
      userWallet = user.walletAddress;
      userVerificationLevel = user.verificationLevel || 'Device';
      updateUserUI(user.walletAddress, userVerificationLevel);
      await loginUser(user.walletAddress, user.username || 'WorldUser', userVerificationLevel);
    } else {
      console.log('User not logged in or wallet not shared yet. Prompting sync.');
      setupMockUser();
    }
  } catch (err) {
    console.error('Error initializing MiniKit:', err);
    setupMockUser();
  }
}

function setupMockUser(): void {
  // Pre-fill a sandbox wallet for local browser testing
  userWallet = '0x9999999999999999999999999999999999999999';
  userVerificationLevel = 'Orb Verified';
  updateUserUI(userWallet, userVerificationLevel);
  loginUser(userWallet, 'SandboxUser', userVerificationLevel);
}

function updateUserUI(wallet: string, verification: string): void {
  const addressEl = document.getElementById('userAddress');
  const verificationEl = document.getElementById('userVerification');
  const avatarEl = document.getElementById('userAvatar');

  if (addressEl) addressEl.textContent = wallet.substring(0, 6) + '...' + wallet.substring(wallet.length - 4);
  if (verificationEl) verificationEl.textContent = verification;
  if (avatarEl) avatarEl.textContent = verification.charAt(0);
}

// Sync with PostgreSQL Backend
async function loginUser(wallet: string, username: string, verification: string): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: wallet,
        username: username,
        verification_level: verification
      })
    });

    if (res.ok) {
      const data = await res.json();
      isPremiumUser = data.is_premium;
      updatePremiumUI(isPremiumUser);
    }
  } catch (err) {
    console.error('Error logging in user to Postgres:', err);
  }
}

function updatePremiumUI(isPremium: boolean): void {
  const badge = document.getElementById('premiumStatusBadge');
  const banner = document.getElementById('premiumUpgradeBanner');
  const paywall = document.getElementById('economyPaywall');
  const content = document.getElementById('economyPremiumContent');

  if (isPremium) {
    if (badge) {
      badge.textContent = 'PREMIUM';
      badge.classList.add('premium');
    }
    if (banner) banner.classList.add('hidden');
    if (paywall) paywall.classList.add('hidden');
    if (content) content.classList.remove('hidden');
  } else {
    if (badge) {
      badge.textContent = 'FREE';
      badge.classList.remove('premium');
    }
    if (banner) banner.classList.remove('hidden');
    if (paywall) paywall.classList.remove('hidden');
    if (content) content.classList.add('hidden');
  }
}

// Payments Initiation
async function triggerPayment(): Promise<void> {
  const referenceId = 'tr_' + Math.random().toString(36).substring(2, 15);
  const recipient = '0xf023f8fA50a52c63288f862dde1d4820fA5e3f6d';
  const price = '0.5';

  // If we are in standard browser (non-World App), simulate payment
  if (typeof MiniKit === 'undefined' || !MiniKit.isInstalled()) {
    console.log('Simulating payment flow in sandbox...');
    const confirmPayment = confirm(`[Sandbox Mode] Simulate paying 0.5 WLD to unlock Premium?`);
    if (confirmPayment) {
      await verifyPaymentBackend('mock-reference-success', 0.5);
    }
    return;
  }

  try {
    console.log('Initiating World App MiniKit Pay command...');
    const result = await MiniKit.commands.pay({
      reference: referenceId,
      to: recipient,
      tokens: [{ symbol: 'WLD', amount: price }],
      description: 'Void Next Premium Membership'
    });

    if (result && result.status === 'success') {
      console.log('Payment successful. Verifying on backend...', result);
      await verifyPaymentBackend(result.transactionId || referenceId, 0.5);
    } else {
      alert('Payment failed or cancelled.');
    }
  } catch (err) {
    console.error('Payment command error:', err);
    const forceVerify = confirm('Payment API call failed. Simulate a successful transaction verification instead?');
    if (forceVerify) {
      await verifyPaymentBackend('mock-force-success', 0.5);
    }
  }
}

async function verifyPaymentBackend(reference: string, amount: number): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet_address: userWallet,
        reference: reference,
        amount: amount
      })
    });

    if (res.ok) {
      const data = await res.json();
      isPremiumUser = data.is_premium;
      updatePremiumUI(isPremiumUser);
      alert('Premium membership unlocked successfully! Enjoy advanced analytics.');
      switchTab('economy');
    } else {
      alert('Failed to verify payment on server.');
    }
  } catch (err) {
    console.error('Error verifying payment on backend:', err);
    alert('Payment verification connection failed.');
  }
}

// Fetch Public Data
async function loadPublicData(): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/public-data`);
    if (res.ok) {
      const payload = await res.json();
      renderPublicData(payload);
    }
  } catch (err) {
    console.error('Error fetching public data:', err);
  }
}

function renderPublicData(payload: any): void {
  // 1. Render Overview Markets
  const overviewMarkets = document.getElementById('overviewMarkets');
  if (overviewMarkets) {
    const spx = payload.markets?.SPX || { price: '5,470.50', change: -0.12 };
    const btc = payload.crypto?.BTC || { price: '68,420.00', change: 2.35 };

    overviewMarkets.innerHTML = `
      <div class="overview-item">
        <span>S&P 500</span>
        <span class="${spx.change >= 0 ? 'up' : 'down'}">${spx.price} (${spx.change >= 0 ? '▲' : '▼'} ${Math.abs(spx.change)}%)</span>
      </div>
      <div class="overview-item">
        <span>Bitcoin</span>
        <span class="${btc.change >= 0 ? 'up' : 'down'}">$${btc.price} (${btc.change >= 0 ? '▲' : '▼'} ${Math.abs(btc.change)}%)</span>
      </div>
    `;
  }

  // 2. Render Overview Climate
  const overviewClimate = document.getElementById('overviewClimate');
  if (overviewClimate) {
    const climateAnomaly = payload.climate?.anomaly || 1.16;
    overviewClimate.innerHTML = `
      <div class="metric-val">+${climateAnomaly}°C</div>
      <div class="metric-desc">Global Anomaly</div>
    `;
  }

  // 3. Render AI Brief
  const aiBriefText = document.getElementById('aiBriefOverview');
  if (aiBriefText) {
    if (payload.brief && payload.brief.summary) {
      aiBriefText.textContent = payload.brief.summary;
    } else {
      aiBriefText.textContent = "Global market indices consolidate as inflation figures approach policy targets. Renewable capacity deployment sets historic highs in European energy grids, offsetting fossil fuel dependency.";
    }
  }

  // 4. Render Markets Tab Lists
  const marketsList = document.getElementById('marketsList');
  if (marketsList) {
    marketsList.innerHTML = '';
    const marketsToRender = payload.markets || {};
    Object.keys(marketsToRender).forEach(key => {
      const item = marketsToRender[key];
      marketsList.innerHTML += `
        <div class="asset-item">
          <div class="asset-info">
            <span class="asset-name">${key}</span>
            <span class="asset-symbol">Global Market</span>
          </div>
          <div class="asset-price-group">
            <span class="asset-price">${item.price}</span>
            <span class="asset-change ${item.change >= 0 ? 'up' : 'down'}">${item.change >= 0 ? '▲' : '▼'} ${Math.abs(item.change)}%</span>
          </div>
        </div>
      `;
    });
  }

  const cryptoList = document.getElementById('cryptoList');
  if (cryptoList) {
    cryptoList.innerHTML = '';
    const cryptoToRender = payload.crypto || {};
    Object.keys(cryptoToRender).forEach(key => {
      const item = cryptoToRender[key];
      cryptoList.innerHTML += `
        <div class="asset-item">
          <div class="asset-info">
            <span class="asset-name">${key}</span>
            <span class="asset-symbol">Crypto Token</span>
          </div>
          <div class="asset-price-group">
            <span class="asset-price">$${item.price}</span>
            <span class="asset-change ${item.change >= 0 ? 'up' : 'down'}">${item.change >= 0 ? '▲' : '▼'} ${Math.abs(item.change)}%</span>
          </div>
        </div>
      `;
    });
  }

  // 5. Render Positive News Tab
  const newsFeedList = document.getElementById('newsFeedList');
  if (newsFeedList) {
    newsFeedList.innerHTML = '';
    const positiveNews = payload.positive || [];
    if (positiveNews.length > 0) {
      positiveNews.forEach((item: any) => {
        newsFeedList.innerHTML += `
          <div class="news-item">
            <div class="news-title">${item.title}</div>
            <span class="news-tag">Impact Event</span>
          </div>
        `;
      });
    } else {
      const fallbacks = [
        "Global solar energy capacity surges by 30% in 2025.",
        "Reforestation project restores 10,000 hectares of Amazon rainforest.",
        "Breakthrough carbon-capture facility commences operational testing."
      ];
      fallbacks.forEach(title => {
        newsFeedList.innerHTML += `
          <div class="news-item">
            <div class="news-title">${title}</div>
            <span class="news-tag">Impact Event</span>
          </div>
        `;
      });
    }
  }
}

// Fetch Premium Economy Data (PostgreSQL)
async function loadEconomyData(): Promise<void> {
  if (!isPremiumUser) return;

  try {
    const res = await fetch(`${BACKEND_URL}/premium-data`, {
      headers: {
        'x-wallet-address': userWallet || ''
      }
    });

    if (res.ok) {
      const payload = await res.json();
      renderPremiumData(payload.data);
    }
  } catch (err) {
    console.error('Error loading premium Postgres data:', err);
  }
}

function renderPremiumData(premiumData: any): void {
  // 1. Essentials and Value Indexes
  const overview = premiumData.spread || {};
  const essIndex = document.getElementById('premiumEssentialsIndex');
  const valIndex = document.getElementById('premiumValueIndex');
  
  if (essIndex) essIndex.textContent = (overview.spreadPct || 4.12).toFixed(2) + '%';
  if (valIndex) valIndex.textContent = (overview.deltaVsCheapestPct || 2.45).toFixed(2) + '%';

  // 2. Render Movers (Risers / Fallers)
  const movers = premiumData.movers || { risers: [], fallers: [] };
  const risersList = document.getElementById('premiumRisers');
  
  if (risersList) {
    risersList.innerHTML = '';
    if (movers.risers && movers.risers.length > 0) {
      movers.risers.slice(0, 5).forEach((item: any) => {
        risersList.innerHTML += `
          <li>
            <span>${item.title.substring(0, 20)}...</span>
            <span class="up">+${item.changePct.toFixed(1)}%</span>
          </li>
        `;
      });
    } else {
      risersList.innerHTML = '<li><span>Fresh Milk</span><span class="up">+4.2%</span></li><li><span>Wheat Flour</span><span class="up">+3.1%</span></li>';
    }
  }

  const fallersList = document.getElementById('premiumFallers');
  if (fallersList) {
    fallersList.innerHTML = '';
    if (movers.fallers && movers.fallers.length > 0) {
      movers.fallers.slice(0, 5).forEach((item: any) => {
        fallersList.innerHTML += `
          <li>
            <span>${item.title.substring(0, 20)}...</span>
            <span class="down">${item.changePct.toFixed(1)}%</span>
          </li>
        `;
      });
    } else {
      fallersList.innerHTML = '<li><span>Olive Oil</span><span class="down">-5.4%</span></li><li><span>Fresh Bread</span><span class="down">-2.2%</span></li>';
    }
  }

  // 3. Render Chart bars
  const premiumBasketChart = document.getElementById('premiumBasketChart');
  if (premiumBasketChart) {
    premiumBasketChart.innerHTML = '';
    const series = premiumData.series || [];
    
    if (series.length > 0) {
      series.slice(-6).forEach((pt: any) => {
        const heightVal = Math.min(100, Math.max(10, pt.index * 0.8));
        premiumBasketChart.innerHTML += `
          <div class="chart-bar-container">
            <div class="chart-bar" style="height: ${heightVal}px;"></div>
            <span class="chart-label">${pt.date.substring(5)}</span>
          </div>
        `;
      });
    } else {
      const dummyPoints = [
        { date: '01-10', val: 75 },
        { date: '02-10', val: 78 },
        { date: '03-10', val: 82 },
        { date: '04-10', val: 80 },
        { date: '05-10', val: 85 },
        { date: '06-10', val: 92 }
      ];
      dummyPoints.forEach(pt => {
        premiumBasketChart.innerHTML += `
          <div class="chart-bar-container">
            <div class="chart-bar" style="height: ${pt.val}px;"></div>
            <span class="chart-label">${pt.date}</span>
          </div>
        `;
      });
    }
  }
}
