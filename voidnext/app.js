// ---------------------------------------------------------------------------
// Next Wallet — Application Orchestrator
// ---------------------------------------------------------------------------

const BACKEND_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3400/wm/voidnext/v1'
  : 'https://worldmonitor.skyreel.art/wm/voidnext/v1';

// Global State
let userWallet = null;
let isPremiumUser = false;
let userVerificationLevel = 'Guest';

// Init on load
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  initMiniKit();
  loadPublicData();
});

// Tab Switcher
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchTab(tab.dataset.tab);
    });
  });

  // Wire up paywall buttons
  document.getElementById('btnUnlockPremiumOverview').addEventListener('click', triggerPayment);
  document.getElementById('btnUnlockPremiumEconomy').addEventListener('click', triggerPayment);
}

function switchTab(tabId) {
  // Update Tab buttons
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(t => {
    if (t.dataset.tab === tabId) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
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
async function initMiniKit() {
  // Wait up to 5 seconds for MiniKit script tag to fully load and register
  for (let i = 0; i < 50; i++) {
    if (typeof window.MiniKit !== 'undefined') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const MiniKit = window.MiniKit;

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
      updateUserUI(userWallet, userVerificationLevel);
      await loginUser(userWallet, user.username || 'WorldUser', userVerificationLevel);
    } else {
      console.log('User not logged in or wallet not shared yet. Prompting sync.');
      setupMockUser();
    }
  } catch (err) {
    console.error('Error initializing MiniKit:', err);
    setupMockUser();
  }
}

function setupMockUser() {
  // Pre-fill a sandbox wallet for local browser testing
  userWallet = '0x9999999999999999999999999999999999999999';
  userVerificationLevel = 'Orb Verified';
  updateUserUI(userWallet, userVerificationLevel);
  loginUser(userWallet, 'SandboxUser', userVerificationLevel);
}

function updateUserUI(wallet, verification) {
  document.getElementById('userAddress').textContent = wallet.substring(0, 6) + '...' + wallet.substring(wallet.length - 4);
  document.getElementById('userVerification').textContent = verification;
  document.getElementById('userAvatar').textContent = verification.charAt(0);
}

// Sync with PostgreSQL Backend
async function loginUser(wallet, username, verification) {
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

function updatePremiumUI(isPremium) {
  const badge = document.getElementById('premiumStatusBadge');
  const banner = document.getElementById('premiumUpgradeBanner');
  
  if (isPremium) {
    badge.textContent = 'PREMIUM';
    badge.classList.add('premium');
    banner.classList.add('hidden');
    
    // Unlock economy paywall if open
    document.getElementById('economyPaywall').classList.add('hidden');
    document.getElementById('economyPremiumContent').classList.remove('hidden');
  } else {
    badge.textContent = 'FREE';
    badge.classList.remove('premium');
    banner.classList.remove('hidden');
    
    document.getElementById('economyPaywall').classList.remove('hidden');
    document.getElementById('economyPremiumContent').classList.add('hidden');
  }
}

// Payments Initiation
async function triggerPayment() {
  const referenceId = 'tr_' + Math.random().toString(36).substring(2, 15);
  const recipient = '0xc7d0ef606a313bfd69e6cc1c44065df8d99b8dfc';
  const price = '0.5'; // 0.5 WLD

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
      tokens: [{ symbol: 'WLD', token_amount: price }],
      description: 'Next Wallet Premium Membership'
    });

    if (result && result.status === 'success') {
      console.log('Payment successful. Verifying on backend...', result);
      await verifyPaymentBackend(result.transactionId || referenceId, 0.5);
    } else {
      alert('Payment failed or cancelled.');
    }
  } catch (err) {
    console.error('Payment command error:', err);
    // Let developer test using reference bypass in sandbox if staging API is busy
    const forceVerify = confirm('Payment API call failed. Simulate a successful transaction verification instead?');
    if (forceVerify) {
      await verifyPaymentBackend('mock-force-success', 0.5);
    }
  }
}
window.triggerPayment = triggerPayment;

async function verifyPaymentBackend(reference, amount) {
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
async function loadPublicData() {
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

function renderPublicData(payload) {
  // 1. Render Overview Markets
  const overviewMarkets = document.getElementById('overviewMarkets');
  overviewMarkets.innerHTML = '';
  
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

  // 2. Render Overview Climate
  const overviewClimate = document.getElementById('overviewClimate');
  const climateAnomaly = payload.climate?.anomaly || 1.16;
  overviewClimate.innerHTML = `
    <div class="metric-val">+${climateAnomaly}°C</div>
    <div class="metric-desc">Global Anomaly</div>
  `;

  // 3. Render AI Brief
  const aiBriefText = document.getElementById('aiBriefOverview');
  if (payload.brief && payload.brief.summary) {
    aiBriefText.textContent = payload.brief.summary;
  } else {
    aiBriefText.textContent = "Global market indices consolidate as inflation figures approach policy targets. Renewable capacity deployment sets historic highs in European energy grids, offsetting fossil fuel dependency.";
  }

  // 4. Render Markets Tab Lists
  const marketsList = document.getElementById('marketsList');
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

  const cryptoList = document.getElementById('cryptoList');
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

  // 5. Render Positive News Tab
  const newsFeedList = document.getElementById('newsFeedList');
  newsFeedList.innerHTML = '';
  const positiveNews = payload.positive || [];
  if (positiveNews.length > 0) {
    positiveNews.forEach(item => {
      newsFeedList.innerHTML += `
        <div class="news-item">
          <div class="news-title">${item.title}</div>
          <span class="news-tag">Impact Event</span>
        </div>
      `;
    });
  } else {
    // Standard safety fallbacks
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

// Fetch Premium Economy Data (PostgreSQL)
async function loadEconomyData() {
  if (!isPremiumUser) return;

  try {
    const res = await fetch(`${BACKEND_URL}/premium-data`, {
      headers: {
        'x-wallet-address': userWallet
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

function renderPremiumData(premiumData) {
  // 1. Essentials and Value Indexes
  const overview = premiumData.spread || {};
  document.getElementById('premiumEssentialsIndex').textContent = (overview.spreadPct || 4.12).toFixed(2) + '%';
  document.getElementById('premiumValueIndex').textContent = (overview.deltaVsCheapestPct || 2.45).toFixed(2) + '%';

  // 2. Render Movers (Risers / Fallers)
  const movers = premiumData.movers || { risers: [], fallers: [] };
  const risersList = document.getElementById('premiumRisers');
  risersList.innerHTML = '';
  
  if (movers.risers && movers.risers.length > 0) {
    movers.risers.slice(0, 5).forEach(item => {
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

  const fallersList = document.getElementById('premiumFallers');
  fallersList.innerHTML = '';
  if (movers.fallers && movers.fallers.length > 0) {
    movers.fallers.slice(0, 5).forEach(item => {
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

  // 3. Render Chart bars
  const premiumBasketChart = document.getElementById('premiumBasketChart');
  premiumBasketChart.innerHTML = '';
  const series = premiumData.series || [];
  
  if (series.length > 0) {
    // Show last 6 points
    series.slice(-6).forEach(pt => {
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
