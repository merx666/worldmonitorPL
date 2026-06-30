// ---------------------------------------------------------------------------
// Next Wallet — Application Orchestrator (TypeScript)
// ---------------------------------------------------------------------------

import confetti from 'canvas-confetti';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AniAds } from 'ani-ads-sdk';

declare const MiniKit: any;

const BACKEND_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:3400/wm/voidnext/v1'
  : 'https://worldmonitor.skyreel.art/wm/voidnext/v1';

// Global State
let userWallet: string = '';
let isPremiumUser: boolean = false;
let userVerificationLevel: string = 'Guest';

// Init on load
window.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  initStreak();
  initPoll();
  initCalculator();
  startCarbonCountdown();
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

async function checkAuthStatus(): Promise<void> {
  const gate = document.getElementById('loginGate');
  if (!gate) return;

  if (typeof MiniKit === 'undefined' || !MiniKit.isInstalled()) {
    // Staging / Local Browser environment
    gate.classList.remove('hidden');
    setupVerifyButton(true);
    return;
  }

  // Real World App Environment
  const user = MiniKit.user;
  if (user?.walletAddress) {
    userWallet = user.walletAddress;
    
    if (user.verificationStatus?.isOrbVerified) {
      userVerificationLevel = 'Orb Verified';
    } else {
      userVerificationLevel = user.verificationLevel || 'Device Verified';
    }

    // Wallet is shared/connected -> let them in!
    gate.classList.add('hidden');
    updateUserUI(userWallet, userVerificationLevel);
    await loginUser(userWallet, user.username || 'WorldUser', userVerificationLevel);
    switchTab('wallet');
  } else {
    gate.classList.remove('hidden');
    setupVerifyButton(false);
  }
}

function setupVerifyButton(isMock: boolean): void {
  const btnVerify = document.getElementById('btnVerifyAndEnter') as HTMLButtonElement | null;
  const gate = document.getElementById('loginGate');
  const errEl = document.getElementById('loginError');

  if (btnVerify && !btnVerify.dataset.bound) {
    btnVerify.dataset.bound = 'true';
    btnVerify.addEventListener('click', async () => {
      if (!btnVerify) return;
      btnVerify.disabled = true;
      btnVerify.textContent = 'Verifying...';
      if (errEl) {
        errEl.textContent = '';
        errEl.classList.add('hidden');
      }

      if (isMock) {
        setTimeout(async () => {
          userWallet = '0x9999999999999999999999999999999999999999';
          userVerificationLevel = 'Orb Verified';
          btnVerify.textContent = 'Verified';
          
          setTimeout(async () => {
            if (gate) gate.classList.add('hidden');
            updateUserUI(userWallet, userVerificationLevel);
            await loginUser(userWallet, 'SandboxUser', userVerificationLevel);
            switchTab('wallet');
          }, 500);
        }, 1000);
      } else {
        try {
          const result = await MiniKit.walletAuth({
            nonce: Math.random().toString(36).substring(2, 15),
            statement: 'Sign in to Next Wallet'
          });
          
          if (result?.data?.address) {
            userWallet = result.data.address;
            userVerificationLevel = 'Verified Wallet';
            
            btnVerify.textContent = 'Verified';
            
            if (gate) gate.classList.add('hidden');
            updateUserUI(userWallet, userVerificationLevel);
            await loginUser(userWallet, 'WorldUser', userVerificationLevel);
            switchTab('wallet');
          } else {
            btnVerify.disabled = false;
            btnVerify.textContent = 'Verify Identity';
            if (errEl) {
              errEl.textContent = 'Verification cancelled or failed.';
              errEl.classList.remove('hidden');
            }
          }
        } catch (e: any) {
          console.error(e);
          btnVerify.disabled = false;
          btnVerify.textContent = 'Verify Identity';
          if (errEl) {
            errEl.textContent = 'Error: ' + (e.message || 'Unknown error');
            errEl.classList.remove('hidden');
          }
        }
      }
    });
  }
}

async function initMiniKit(): Promise<void> {
  // Wait up to 5 seconds for MiniKit script tag to fully load and register
  for (let i = 0; i < 50; i++) {
    if (typeof (window as any).MiniKit !== 'undefined') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  try {
    if (typeof MiniKit === 'undefined') {
      console.warn('MiniKit SDK not found. Running in Web Sandbox mode.');
      await checkAuthStatus();
      return;
    }

    const installResult = MiniKit.install('app_staging_f023f8');
    console.log('MiniKit install status:', installResult);

    await checkAuthStatus();
  } catch (err) {
    console.error('Error initializing MiniKit:', err);
    await checkAuthStatus();
  }
}

function updateUserUI(wallet: string, verification: string): void {
  const addressEl = document.getElementById('userAddress');
  const verificationEl = document.getElementById('userVerification');
  const avatarEl = document.getElementById('userAvatar');

  if (addressEl) addressEl.textContent = wallet.substring(0, 6) + '...' + wallet.substring(wallet.length - 4);
  if (verificationEl) verificationEl.textContent = verification;
  if (avatarEl) avatarEl.textContent = verification.charAt(0);

  // Mount or update Ani Ads
  const adsContainer = document.getElementById('ani-ads-container');
  if (adsContainer) {
    // If not yet initialized, create a root
    if (!(adsContainer as any)._reactRoot) {
      (adsContainer as any)._reactRoot = createRoot(adsContainer);
    }
    const root = (adsContainer as any)._reactRoot as Root;
    root.render(
      React.createElement(AniAds, {
        creator_wallet: "0xc7d0ef606a313bfd69e6cc1c44065df8d99b8dfc",
        app_name: "Next wallet",
        user_wallet_address: wallet
      })
    );
  }

  // Refresh wallet tab details dynamically
  initWallet();
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
    if (content) content.classList.remove('hidden');
  }
}

// Payments Initiation
async function triggerPayment(): Promise<void> {
  // WorldApp requires a valid UUIDv4 for the reference, otherwise the native app crashes
  const referenceId = crypto.randomUUID();
  const recipient = '0xc7d0ef606a313bfd69e6cc1c44065df8d99b8dfc';

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
    const result = await MiniKit.pay({
      reference: referenceId,
      to: recipient,
      tokens: [{ symbol: 'WLD', token_amount: '500000000000000000' }], // 0.5 WLD in base units (18 decimals)
      description: 'Next Wallet Premium Membership'
    });

    if (result?.transactionId) {
      console.log('Payment successful. Verifying on backend...', result);
      await verifyPaymentBackend(result.transactionId, 0.5);
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
    if (payload.brief?.summary) {
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

  // 5. Render Positive News Tab (Now handled by RSS feed independently)
}

// Fetch Premium Economy Data (PostgreSQL)
async function loadEconomyData(): Promise<void> {
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

// ---------------------------------------------------------------------------
// Gamification and Engagement Enhancements
// ---------------------------------------------------------------------------

function initStreak(): void {
  const streakDaysEl = document.getElementById('streakDays');
  const btnCheckIn = document.getElementById('btnCheckIn') as HTMLButtonElement | null;
  const streakMutedEl = document.getElementById('streakMuted');

  if (!btnCheckIn || !streakDaysEl) return;

  const todayStr = new Date().toISOString().split('T')[0] || '';
  let streakCount = parseInt(localStorage.getItem('void_next_streak_count') || '0', 10);
  const lastCheckin = localStorage.getItem('void_next_last_checkin');

  // Verify if streak is broken
  if (lastCheckin) {
    const lastDate = new Date(lastCheckin);
    const todayDate = new Date(todayStr);
    const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 1 && lastCheckin !== todayStr) {
      streakCount = 0;
      localStorage.setItem('void_next_streak_count', '0');
    }
  }

  // Update UI
  streakDaysEl.textContent = `${streakCount}-Day Streak`;

  if (lastCheckin === todayStr) {
    btnCheckIn.textContent = 'Checked In';
    btnCheckIn.classList.add('checked-in');
    btnCheckIn.disabled = true;
    if (streakMutedEl) streakMutedEl.textContent = "You've checked in today! Come back tomorrow.";
  } else {
    btnCheckIn.textContent = 'Check In';
    btnCheckIn.classList.remove('checked-in');
    btnCheckIn.disabled = false;
    if (streakMutedEl) streakMutedEl.textContent = 'Keep opening Next Wallet daily to increase your score!';
  }

  btnCheckIn.addEventListener('click', () => {
    streakCount += 1;
    localStorage.setItem('void_next_streak_count', streakCount.toString());
    localStorage.setItem('void_next_last_checkin', todayStr);

    streakDaysEl.textContent = `${streakCount}-Day Streak`;
    btnCheckIn.textContent = 'Checked In';
    btnCheckIn.classList.add('checked-in');
    btnCheckIn.disabled = true;
    if (streakMutedEl) streakMutedEl.textContent = "You've checked in today! Come back tomorrow.";

    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  });
}

function initPoll(): void {
  const pollOptions = document.getElementById('pollOptions');
  const pollResults = document.getElementById('pollResults');
  const optionButtons = document.querySelectorAll('.poll-option-btn');

  if (!pollOptions || !pollResults) return;

  const hasVoted = localStorage.getItem('void_next_voted_poll') === 'true';

  // Fetch current results from PostgreSQL
  fetch(`${BACKEND_URL}/poll`)
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        renderPollResults(data.votes);
        if (hasVoted) {
          pollOptions.classList.add('hidden');
          pollResults.classList.remove('hidden');
        }
      }
    })
    .catch(err => console.error('Error fetching poll:', err));

  optionButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const option = (btn as HTMLElement).dataset.vote;
      if (option !== 'bull' && option !== 'bear') return;

      try {
        const res = await fetch(`${BACKEND_URL}/poll/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ option })
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('void_next_voted_poll', 'true');

          renderPollResults(data.votes);
          pollOptions.classList.add('hidden');
          pollResults.classList.remove('hidden');

          confetti({
            particleCount: 120,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      } catch (err) {
        console.error('Error casting vote:', err);
      }
    });
  });
}

function renderPollResults(votes: Record<string, number>): void {
  const bullVotes = votes.bull || 0;
  const bearVotes = votes.bear || 0;
  const total = bullVotes + bearVotes;

  const bullPct = total > 0 ? Math.round((bullVotes / total) * 100) : 50;
  const bearPct = total > 0 ? Math.round((bearVotes / total) * 100) : 50;

  const bullPctEl = document.getElementById('bullPct');
  const bearPctEl = document.getElementById('bearPct');
  const bullBar = document.querySelector('.bull-bar') as HTMLElement | null;
  const bearBar = document.querySelector('.bear-bar') as HTMLElement | null;

  if (bullPctEl) bullPctEl.textContent = `${bullPct}%`;
  if (bearPctEl) bearPctEl.textContent = `${bearPct}%`;

  if (bullBar) bullBar.style.width = `${bullPct}%`;
  if (bearBar) bearBar.style.width = `${bearPct}%`;
}

function initCalculator(): void {
  const btnCalculate = document.getElementById('btnCalculateInflation');
  const calcResult = document.getElementById('calcResult');
  const calcResultVal = document.getElementById('calcResultVal');

  const inputFood = document.getElementById('calcFood') as HTMLInputElement | null;
  const inputEnergy = document.getElementById('calcEnergy') as HTMLInputElement | null;
  const inputOther = document.getElementById('calcOther') as HTMLInputElement | null;

  if (!btnCalculate || !calcResult || !calcResultVal || !inputFood || !inputEnergy || !inputOther) return;

  btnCalculate.addEventListener('click', () => {
    const food = parseFloat(inputFood.value) || 0;
    const energy = parseFloat(inputEnergy.value) || 0;
    const other = parseFloat(inputOther.value) || 0;

    const total = food + energy + other;
    if (total <= 0) {
      alert('Please enter budget amounts greater than zero.');
      return;
    }

    // Weighted average based on current domain index estimation:
    // Food: 4.8%, Energy: 6.2%, Other: 2.9%
    const rate = ((food * 4.8) + (energy * 6.2) + (other * 2.9)) / total;

    // Show result
    calcResult.classList.remove('hidden');
    
    // Animate counter
    let current = 0;
    const target = rate;
    const duration = 800; // ms
    const startTime = performance.now();

    function updateCounter(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeProgress = progress * (2 - progress);
      current = easeProgress * target;
      
      if (calcResultVal) {
        calcResultVal.textContent = current.toFixed(2) + '%';
      }

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        if (calcResultVal) {
          calcResultVal.textContent = target.toFixed(2) + '%';
        }
      }
    }

    requestAnimationFrame(updateCounter);
  });
}

// ---------------------------------------------------------------------------
// World Chain Wallet Integration
// ---------------------------------------------------------------------------

interface TokenConfig {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  priceUSD: number;
}

const SUPPORTED_TOKENS: TokenConfig[] = [
  { symbol: 'ETH', name: 'Ethereum', address: '0x0000000000000000000000000000000000000000', decimals: 18, priceUSD: 1560.0 },
  { symbol: 'WLD', name: 'Worldcoin', address: '0x2cfc85d8e48f8eab294be644d9e25c3030863003', decimals: 18, priceUSD: 0.49 },
  { symbol: 'USDC.e', name: 'Bridged USDC', address: '0x79a02482a880bce3f13e09da970dc34db4cd24d1', decimals: 6, priceUSD: 1.0 },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', address: '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa3', decimals: 8, priceUSD: 58900.0 },
  { symbol: 'DNA', name: 'DNAToken', address: '0xed49fe44fd4249a09843c2ba4bba7e50beca7113', decimals: 18, priceUSD: 0.00000067 },
  { symbol: '$AXO', name: 'AXOLOCOIN', address: '0x249820c0479d0a7fee6a2a3a14583267550f3caf', decimals: 18, priceUSD: 0.0000097 },
  { symbol: 'WDD', name: 'Drachma', address: '0xede54d9c024ee80c85ec0a75ed2d8774c7fbac9b', decimals: 18, priceUSD: 0.0 },
  { symbol: 'ORO', name: 'ORO', address: '0xcd1e32b86953d79a6ac58e813d2ea7a1790cab63', decimals: 18, priceUSD: 0.0 },
  { symbol: 'PERSIAN', name: 'PERSIAN', address: '0x155f02fa987b0e1db16090bf9ac02f0e71fa12c1', decimals: 18, priceUSD: 0.00004 },
  { symbol: 'PUF', name: 'PUF', address: '0x1ae3498f1b417fe31be544b04b711f27ba437bd3', decimals: 18, priceUSD: 0.0 },
  { symbol: 'MODO', name: 'MODO Token', address: '0x306cb44390b77410fcc414d9457e946cc0c053d0', decimals: 18, priceUSD: 0.0015 }
];

let lastBalances: Record<string, number> = {};
let activeQuote: any = null;

async function fetchAllBalances(wallet: string): Promise<Record<string, number>> {
  const batch = SUPPORTED_TOKENS.map((token, index) => {
    if (token.address === '0x0000000000000000000000000000000000000000') {
      return {
        jsonrpc: '2.0',
        id: index,
        method: 'eth_getBalance',
        params: [wallet, 'latest']
      };
    } else {
      const cleanAddr = wallet.toLowerCase().replace('0x', '');
      const paddedAddr = cleanAddr.padStart(64, '0');
      const data = '0x70a08231' + paddedAddr;
      return {
        jsonrpc: '2.0',
        id: index,
        method: 'eth_call',
        params: [{ to: token.address, data }, 'latest']
      };
    }
  });

  const response = await fetch('https://worldchain-mainnet.g.alchemy.com/public', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch)
  });

  if (!response.ok) throw new Error('RPC batch error');
  const results = await response.json();
  
  const balances: Record<string, number> = {};
  results.forEach((res: any) => {
    const token = SUPPORTED_TOKENS[res.id];
    if (!token) return;
    if (res.error) {
      balances[token.symbol] = 0;
      return;
    }
    const hexVal = res.result;
    const rawVal = BigInt(hexVal === '0x' || !hexVal ? '0x0' : hexVal);
    balances[token.symbol] = formatBigIntToNumber(rawVal, token.decimals);
  });

  return balances;
}

function formatBigIntToNumber(val: bigint, decimals: number): number {
  const str = val.toString();
  if (str === '0') return 0;
  if (str.length <= decimals) {
    return Number('0.' + str.padStart(decimals, '0'));
  }
  const intPart = str.slice(0, -decimals);
  const fracPart = str.slice(-decimals);
  return Number(`${intPart}.${fracPart}`);
}

function parseAmountToBigInt(amount: number, decimals: number): bigint {
  const str = amount.toFixed(decimals);
  const parts = str.split('.');
  const intPart = BigInt(parts[0] || '0');
  const fracPart = BigInt(parts[1] || '0');
  return intPart * (10n ** BigInt(decimals)) + fracPart;
}

async function fetchSwapQuote(fromSymbol: string, toSymbol: string, amount: number): Promise<any> {
  const fromToken = SUPPORTED_TOKENS.find(t => t.symbol === fromSymbol);
  const toToken = SUPPORTED_TOKENS.find(t => t.symbol === toSymbol);
  if (!fromToken || !toToken || !userWallet) throw new Error('Token or wallet not configured');

  const rawAmount = parseAmountToBigInt(amount, fromToken.decimals);
  const feeAmount = rawAmount / 200n; // 0.5%
  const swapAmount = rawAmount - feeAmount;

  const url = `https://li.quest/v1/quote?fromChain=480&toChain=480` +
              `&fromToken=${fromToken.address}` +
              `&toToken=${toToken.address}` +
              `&fromAmount=${swapAmount.toString()}` +
              `&fromAddress=${userWallet}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to fetch swap route');
  }
  const data = await res.json();
  return {
    rawQuote: data,
    feeAmount: formatBigIntToNumber(feeAmount, fromToken.decimals),
    toAmount: formatBigIntToNumber(BigInt(data.estimate.toAmount), toToken.decimals),
    approvalAddress: data.estimate.approvalAddress,
    transactionRequest: data.transactionRequest
  };
}

function encodeERC20Transfer(toAddress: string, amount: bigint): string {
  const selector = '0xa9059cbb';
  const cleanAddress = toAddress.toLowerCase().replace('0x', '');
  const paddedAddress = cleanAddress.padStart(64, '0');
  const hexAmount = amount.toString(16);
  const paddedAmount = hexAmount.padStart(64, '0');
  return selector + paddedAddress + paddedAmount;
}

function encodeERC20Approve(spender: string, amount: bigint): string {
  const selector = '0x095ea7b3';
  const cleanSpender = spender.toLowerCase().replace('0x', '');
  const paddedSpender = cleanSpender.padStart(64, '0');
  const hexAmount = amount.toString(16);
  const paddedAmount = hexAmount.padStart(64, '0');
  return selector + paddedSpender + paddedAmount;
}

let sparklineData: number[] = [];

function initSparkline(currentPrice: number): void {
  const dataPoints = 25;
  let val = currentPrice * 0.97;
  const data: number[] = [];
  for (let i = 0; i < dataPoints; i++) {
    const change = (Math.random() - 0.45) * 0.01 * val;
    val += change;
    data.push(val);
  }
  data[data.length - 1] = currentPrice;
  sparklineData = data;
  renderSparkline();

  const intervalId = (window as any)._sparklineIntervalId;
  if (intervalId) clearInterval(intervalId);

  (window as any)._sparklineIntervalId = setInterval(() => {
    if (sparklineData.length === 0) return;
    const lastPrice = sparklineData[sparklineData.length - 1];
    if (lastPrice === undefined) return;
    const change = (Math.random() - 0.5) * 0.003 * lastPrice;
    const newPrice = Math.max(0.1, lastPrice + change);
    sparklineData.shift();
    sparklineData.push(newPrice);
    renderSparkline();
  }, 4000);
}

function renderSparkline(): void {
  const svg = document.getElementById('walletNetWorthSparkline') as SVGSVGElement | null;
  const changeEl = document.getElementById('walletTrendChange');
  if (!svg || sparklineData.length === 0) return;

  const width = 300;
  const height = 80;
  const padding = 5;

  const min = Math.min(...sparklineData);
  const max = Math.max(...sparklineData);
  const range = max - min || 1;

  const points = sparklineData.map((val, idx) => {
    const x = padding + (idx / (sparklineData.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return { x, y };
  });

  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  if (!lastPoint || !firstPoint) return;

  const linePath = points.map((p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const areaPath = linePath + ` L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`;

  const lineEl = svg.querySelector('.sparkline-line') as SVGPathElement | null;
  const areaEl = svg.querySelector('.sparkline-area') as SVGPathElement | null;
  const dotEl = svg.querySelector('.sparkline-dot') as SVGCircleElement | null;

  if (lineEl) lineEl.setAttribute('d', linePath);
  if (areaEl) areaEl.setAttribute('d', areaPath);
  
  if (dotEl) {
    dotEl.setAttribute('cx', lastPoint.x.toString());
    dotEl.setAttribute('cy', lastPoint.y.toString());
  }

  const first = sparklineData[0];
  const last = sparklineData[sparklineData.length - 1];
  if (first === undefined || last === undefined || first === 0) return;
  const pct = ((last - first) / first) * 100;
  
  if (changeEl) {
    changeEl.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    changeEl.className = `trend-change ${pct >= 0 ? 'positive' : 'negative'}`;
  }
}

function renderAllocationDonut(balances: Record<string, number>): void {
  const segmentsGroup = document.getElementById('donutSegments');
  const legendEl = document.getElementById('allocationLegend');
  const centerValEl = document.getElementById('donutCenterValue');
  if (!segmentsGroup || !legendEl || !centerValEl) return;

  const assets: { symbol: string; valUSD: number; color: string }[] = [];
  const colors: Record<string, string> = {
    WLD: '#6366f1',
    ETH: '#3b82f6',
    'USDC.e': '#10b981',
    WBTC: '#f59e0b',
    DNA: '#ec4899',
    '$AXO': '#8b5cf6',
    WDD: '#06b6d4',
    ORO: '#14b8a6',
    PERSIAN: '#f43f5e',
    PUF: '#a855f7',
    MODO: '#a5b4fc'
  };

  let totalUsd = 0;
  SUPPORTED_TOKENS.forEach(t => {
    const bal = balances[t.symbol] || 0;
    const val = bal * t.priceUSD;
    if (val > 0) {
      assets.push({
        symbol: t.symbol,
        valUSD: val,
        color: colors[t.symbol] || '#6b7280'
      });
      totalUsd += val;
    }
  });

  assets.sort((a, b) => b.valUSD - a.valUSD);

  let displayAssets = assets;
  let displayTotal = totalUsd;
  
  if (totalUsd === 0) {
    displayAssets = [
      { symbol: 'WLD', valUSD: 150.0, color: '#6366f1' },
      { symbol: 'USDC.e', valUSD: 75.0, color: '#10b981' },
      { symbol: 'ETH', valUSD: 25.0, color: '#3b82f6' }
    ];
    displayTotal = 250.0;
  }

  segmentsGroup.innerHTML = '';
  legendEl.innerHTML = '';

  const r = 70;
  const circumference = 2 * Math.PI * r;
  let currentOffset = 0;

  displayAssets.forEach((asset) => {
    const pct = asset.valUSD / displayTotal;
    const strokeDash = pct * circumference;
    const strokeOffset = currentOffset;
    currentOffset += strokeDash;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'donut-segment');
    circle.setAttribute('cx', '100');
    circle.setAttribute('cy', '100');
    circle.setAttribute('r', r.toString());
    circle.setAttribute('fill', 'transparent');
    circle.setAttribute('stroke', asset.color);
    circle.setAttribute('stroke-width', '20');
    circle.setAttribute('stroke-dasharray', `${strokeDash} ${circumference - strokeDash}`);
    circle.setAttribute('stroke-dashoffset', (-strokeOffset).toString());
    circle.setAttribute('transform', 'rotate(-90 100 100)');
    circle.setAttribute('style', `filter: drop-shadow(0 0 4px ${asset.color}40); transition: all 0.3s ease;`);

    circle.addEventListener('mouseenter', () => {
      circle.setAttribute('stroke-width', '24');
      centerValEl.textContent = `$${(totalUsd === 0 ? 0 : asset.valUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const centerLabel = centerValEl.previousElementSibling;
      if (centerLabel) centerLabel.textContent = asset.symbol;
    });

    circle.addEventListener('mouseleave', () => {
      circle.setAttribute('stroke-width', '20');
      centerValEl.textContent = `$${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const centerLabel = centerValEl.previousElementSibling;
      if (centerLabel) centerLabel.textContent = 'PORTFOLIO';
    });

    segmentsGroup.appendChild(circle);

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    const percentDisplay = (pct * 100).toFixed(0);
    legendItem.innerHTML = `
      <div class="legend-info">
        <span class="legend-color-dot" style="background-color: ${asset.color}; box-shadow: 0 0 8px ${asset.color};"></span>
        <span class="legend-label-text">${asset.symbol}</span>
      </div>
      <span class="legend-value">${percentDisplay}%</span>
    `;
    legendEl.appendChild(legendItem);
  });
}

async function syncPricesWithLifi(): Promise<void> {
  try {
    const res = await fetch('https://li.quest/v1/tokens?chains=480');
    if (!res.ok) return;
    const data = await res.json();
    const lifiTokens = data.tokens?.[480] || [];
    SUPPORTED_TOKENS.forEach(t => {
      const found = lifiTokens.find((lt: any) => lt.address.toLowerCase() === t.address.toLowerCase());
      if (found?.priceUSD) {
        t.priceUSD = parseFloat(found.priceUSD);
      }
    });
  } catch (e) {
    console.error('Failed to sync token prices with LI.FI:', e);
  }
}

async function updateWalletBalances(): Promise<void> {
  const totalUsdEl = document.getElementById('walletTotalUSD');
  const primaryWldEl = document.getElementById('walletBalanceWLD');
  const tokenListEl = document.getElementById('walletTokenList');
  const srcBalanceEl = document.getElementById('swapSourceBalance');
  const tgtBalanceEl = document.getElementById('swapTargetBalance');

  const srcToken = (document.getElementById('swapSourceToken') as HTMLSelectElement | null)?.value || 'WLD';
  const tgtToken = (document.getElementById('swapTargetToken') as HTMLSelectElement | null)?.value || 'USDC.e';

  if (!userWallet) return;

  try {
    const balances = await fetchAllBalances(userWallet);
    lastBalances = balances;

    renderAllocationDonut(balances);

    let totalUsd = 0;
    SUPPORTED_TOKENS.forEach(t => {
      totalUsd += (balances[t.symbol] || 0) * t.priceUSD;
    });

    if (totalUsdEl) totalUsdEl.textContent = `$${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    if (primaryWldEl) primaryWldEl.textContent = `${(balances['WLD'] || 0).toFixed(4)} WLD`;

    if (srcBalanceEl) srcBalanceEl.textContent = `Balance: ${(balances[srcToken] || 0).toFixed(4)}`;
    if (tgtBalanceEl) tgtBalanceEl.textContent = `Balance: ${(balances[tgtToken] || 0).toFixed(4)}`;

    if (tokenListEl) {
      tokenListEl.innerHTML = '';
      SUPPORTED_TOKENS.forEach(t => {
        const bal = balances[t.symbol] || 0;
        const val = bal * t.priceUSD;
        
        tokenListEl.innerHTML += `
          <div class="token-item">
            <div class="token-info">
              <div class="token-icon-fallback">${t.symbol.charAt(0)}</div>
              <div class="token-name-symbol">
                <span class="token-name">${t.name}</span>
                <span class="token-symbol">${t.symbol}</span>
              </div>
            </div>
            <div class="token-balance-col">
              <span class="token-balance-amount">${bal.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
              <span class="token-balance-usd">$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        `;
      });
    }
  } catch (err) {
    console.error('Failed to update wallet balances:', err);
    if (tokenListEl) tokenListEl.innerHTML = '<div class="error-msg">RPC Error: Failed to fetch balances</div>';
  }
}

function initWallet(): void {
  const walletBadge = document.getElementById('walletVerificationBadge');
  const walletFullAddress = document.getElementById('walletFullAddress');
  const btnCopy = document.getElementById('btnCopyWalletAddress');
  const btnSend = document.getElementById('btnWalletSend');
  const btnReceive = document.getElementById('btnWalletReceive');

  const srcSelect = document.getElementById('swapSourceToken') as HTMLSelectElement | null;
  const tgtSelect = document.getElementById('swapTargetToken') as HTMLSelectElement | null;
  const srcAmountInput = document.getElementById('swapSourceAmount') as HTMLInputElement | null;
  const tgtAmountInput = document.getElementById('swapTargetAmount') as HTMLInputElement | null;
  
  const quoteDetails = document.getElementById('swapQuoteDetails');
  const exchangeRateEl = document.getElementById('swapExchangeRate');
  const serviceFeeEl = document.getElementById('swapServiceFee');
  const btnExecute = document.getElementById('btnExecuteSwap') as HTMLButtonElement | null;
  const btnReverse = document.getElementById('btnSwapReverse');

  if (!userWallet) return;

  const wldPrice = SUPPORTED_TOKENS.find(t => t.symbol === 'WLD')?.priceUSD || 2.25;
  initSparkline(wldPrice);

  if (walletBadge) {
    walletBadge.textContent = userVerificationLevel || 'Device Verified';
  }

  if (walletFullAddress) {
    walletFullAddress.innerHTML = `${userWallet.substring(0, 8)}...${userWallet.substring(userWallet.length - 8)} <span class="copy-icon">📋</span>`;
  }

  if (btnCopy && !(btnCopy as any).dataset.bound) {
    (btnCopy as any).dataset.bound = 'true';
    btnCopy.addEventListener('click', () => {
      if (userWallet) {
        navigator.clipboard.writeText(userWallet).then(() => {
          const valEl = btnCopy.querySelector('#walletFullAddress');
          if (valEl) {
            valEl.innerHTML = `Copied! <span class="copy-icon">✓</span>`;
            setTimeout(() => {
              valEl.innerHTML = `${userWallet!.substring(0, 8)}...${userWallet!.substring(userWallet!.length - 8)} <span class="copy-icon">📋</span>`;
            }, 2000);
          }
        }).catch(err => console.error('Copy failed:', err));
      }
    });
  }

  syncPricesWithLifi().finally(() => {
    updateWalletBalances();
  });

  if (btnSend && !(btnSend as any).dataset.bound) {
    (btnSend as any).dataset.bound = 'true';
    btnSend.addEventListener('click', async () => {
      const recipient = prompt('Enter recipient address:');
      if (!recipient) return;
      if (!recipient.startsWith('0x') || recipient.length !== 42) {
        alert('Invalid address format.');
        return;
      }
      const amount = prompt('Enter amount of WLD to send:');
      if (!amount) return;
      const parsedAmount = parseFloat(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        alert('Invalid amount.');
        return;
      }

      const referenceId = 'tr_send_' + Math.random().toString(36).substring(2, 15);

      if (typeof MiniKit === 'undefined' || !MiniKit.isInstalled()) {
        const confirmSend = confirm(`[Sandbox Mode] Simulate sending ${parsedAmount} WLD to ${recipient}?`);
        if (confirmSend) {
          alert('Transfer simulated successfully!');
          updateWalletBalances();
        }
        return;
      }

      try {
        const result = await MiniKit.pay({
          reference: referenceId,
          to: recipient,
          tokens: [{ symbol: 'WLD', token_amount: amount }],
          description: 'WLD Wallet Transfer'
        });

        if (result?.transactionId) {
          alert(`Successfully sent ${amount} WLD!`);
          updateWalletBalances();
        } else {
          alert('Transfer failed or cancelled.');
        }
      } catch (err) {
        console.error('Transfer error:', err);
        alert('Error: ' + err);
      }
    });
  }

  if (btnReceive && !(btnReceive as any).dataset.bound) {
    (btnReceive as any).dataset.bound = 'true';
    btnReceive.addEventListener('click', () => {
      if (userWallet) {
        navigator.clipboard.writeText(userWallet).then(() => {
          alert(`Copied wallet address: ${userWallet}\nSend WLD on World Chain network to this address to deposit.`);
        });
      }
    });
  }

  // Swap Form Handlers
  const handleQuoteUpdate = async () => {
    if (!srcSelect || !tgtSelect || !srcAmountInput || !tgtAmountInput || !userWallet) return;
    
    const amount = parseFloat(srcAmountInput.value);
    if (Number.isNaN(amount) || amount <= 0) {
      tgtAmountInput.value = '';
      if (quoteDetails) quoteDetails.classList.add('hidden');
      if (btnExecute) btnExecute.disabled = true;
      return;
    }

    try {
      if (btnExecute) {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Quoting...';
      }

      const quote = await fetchSwapQuote(srcSelect.value, tgtSelect.value, amount);
      activeQuote = quote;

      tgtAmountInput.value = quote.toAmount.toFixed(6);

      if (exchangeRateEl) exchangeRateEl.textContent = `1 ${srcSelect.value} = ${(quote.toAmount / (amount * 0.995)).toFixed(4)} ${tgtSelect.value}`;
      if (serviceFeeEl) serviceFeeEl.textContent = `${quote.feeAmount.toFixed(6)} ${srcSelect.value}`;

      if (quoteDetails) quoteDetails.classList.remove('hidden');
      if (btnExecute) {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Swap Assets';
      }
    } catch (e: any) {
      console.error('Swap quote error:', e);
      tgtAmountInput.value = 'Quote Error';
      if (btnExecute) {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Swap Assets';
      }
    }
  };

  if (srcSelect && !srcSelect.dataset.bound) {
    srcSelect.dataset.bound = 'true';
    srcSelect.addEventListener('change', () => {
      const srcBal = lastBalances[srcSelect.value] || 0;
      const srcBalanceEl = document.getElementById('swapSourceBalance');
      if (srcBalanceEl) srcBalanceEl.textContent = `Balance: ${srcBal.toFixed(4)}`;
      handleQuoteUpdate();
    });
  }

  if (tgtSelect && !tgtSelect.dataset.bound) {
    tgtSelect.dataset.bound = 'true';
    tgtSelect.addEventListener('change', () => {
      const tgtBal = lastBalances[tgtSelect.value] || 0;
      const tgtBalanceEl = document.getElementById('swapTargetBalance');
      if (tgtBalanceEl) tgtBalanceEl.textContent = `Balance: ${tgtBal.toFixed(4)}`;
      handleQuoteUpdate();
    });
  }

  if (srcAmountInput && !srcAmountInput.dataset.bound) {
    srcAmountInput.dataset.bound = 'true';
    let timeout: any = null;
    srcAmountInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleQuoteUpdate, 500);
    });
  }

  if (btnExecute && !btnExecute.dataset.bound) {
    btnExecute.dataset.bound = 'true';
    btnExecute.addEventListener('click', async () => {
      if (!activeQuote || !srcSelect || !tgtSelect || !srcAmountInput || !tgtAmountInput) return;
      const amount = parseFloat(srcAmountInput.value);
      if (Number.isNaN(amount) || amount <= 0) return;

      const userBal = lastBalances[srcSelect.value] || 0;
      if (userBal < amount) {
        alert('Insufficient balance.');
        return;
      }

      try {
        btnExecute.disabled = true;
        btnExecute.textContent = 'Executing...';

        const fromToken = SUPPORTED_TOKENS.find(t => t.symbol === srcSelect.value)!;

        const rawAmount = parseAmountToBigInt(amount, fromToken.decimals);
        const feeAmount = rawAmount / 200n; // 0.5%
        const feeWallet = '0xc7d0ef606a313bfd69e6cc1c44065df8d99b8dfc';

        const txs: any[] = [];

        // Tx 1: ERC20 approve if tokenIn is not native ETH
        if (fromToken.address !== '0x0000000000000000000000000000000000000000') {
          const approveData = encodeERC20Approve(activeQuote.approvalAddress, rawAmount);
          txs.push({
            to: fromToken.address,
            value: '0x0',
            data: approveData
          });
        }

        // Tx 2: Fee transfer
        if (fromToken.address === '0x0000000000000000000000000000000000000000') {
          txs.push({
            to: feeWallet,
            value: '0x' + feeAmount.toString(16),
            data: '0x'
          });
        } else {
          const feeTransferData = encodeERC20Transfer(feeWallet, feeAmount);
          txs.push({
            to: fromToken.address,
            value: '0x0',
            data: feeTransferData
          });
        }

        // Tx 3: Swap call
        txs.push({
          to: activeQuote.transactionRequest.to,
          value: activeQuote.transactionRequest.value || '0x0',
          data: activeQuote.transactionRequest.data
        });

        if (typeof MiniKit === 'undefined' || !MiniKit.isInstalled()) {
          const confirmSwap = confirm(`[Sandbox Mode] Simulate atomic swap of ${amount} ${srcSelect.value} to ${tgtSelect.value}?`);
          if (confirmSwap) {
            alert('Swap simulated successfully!');
            srcAmountInput.value = '';
            tgtAmountInput.value = '';
            if (quoteDetails) quoteDetails.classList.add('hidden');
            updateWalletBalances();
          }
          btnExecute.disabled = false;
          btnExecute.textContent = 'Swap Assets';
          return;
        }

        const result = await MiniKit.sendTransaction({
          chainId: 480,
          transactions: txs
        });

        if (result && result.status === 'success') {
          alert('Swap executed successfully!');
          srcAmountInput.value = '';
          tgtAmountInput.value = '';
          if (quoteDetails) quoteDetails.classList.add('hidden');
          updateWalletBalances();
        } else {
          alert('Swap rejected or failed.');
        }
      } catch (e: any) {
        console.error('Swap execution error:', e);
        alert('Swap failed: ' + e.message);
      } finally {
        btnExecute.disabled = false;
        btnExecute.textContent = 'Swap Assets';
      }
    });
  }

  if (btnReverse && !btnReverse.dataset.bound) {
    btnReverse.dataset.bound = 'true';
    btnReverse.addEventListener('click', () => {
      if (!srcSelect || !tgtSelect) return;
      const temp = srcSelect.value;
      srcSelect.value = tgtSelect.value;
      tgtSelect.value = temp;

      const srcBal = lastBalances[srcSelect.value] || 0;
      const tgtBal = lastBalances[tgtSelect.value] || 0;

      const srcBalanceEl = document.getElementById('swapSourceBalance');
      const tgtBalanceEl = document.getElementById('swapTargetBalance');

      if (srcBalanceEl) srcBalanceEl.textContent = `Balance: ${srcBal.toFixed(4)}`;
      if (tgtBalanceEl) tgtBalanceEl.textContent = `Balance: ${tgtBal.toFixed(4)}`;

      handleQuoteUpdate();
    });
  }

  // Wire up percentage buttons
  const pctButtons = document.querySelectorAll('.swap-percentage-buttons .btn-pct');
  pctButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!srcSelect || !srcAmountInput) return;
      const pct = parseFloat((btn as HTMLButtonElement).dataset.pct || '0');
      const tokenSymbol = srcSelect.value;
      const balance = lastBalances[tokenSymbol] || 0;
      
      const targetAmount = balance * pct;
      if (targetAmount > 0) {
        srcAmountInput.value = targetAmount.toFixed(6).replace(/\.?0+$/, '');
      } else {
        srcAmountInput.value = '';
      }
      
      handleQuoteUpdate();
    });
  });
}

function startCarbonCountdown(): void {
  const targetDate = new Date('2031-10-15T00:00:00Z').getTime();

  function update() {
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
      const cdEl = document.getElementById('carbonCountdown');
      if (cdEl) cdEl.textContent = 'EXHAUSTED';
      return;
    }

    const secsTotal = Math.floor(diff / 1000);
    const minsTotal = Math.floor(secsTotal / 60);
    const hoursTotal = Math.floor(minsTotal / 60);
    const daysTotal = Math.floor(hoursTotal / 24);

    const years = Math.floor(daysTotal / 365);
    const days = daysTotal % 365;
    const hours = hoursTotal % 24;
    const mins = minsTotal % 60;
    const secs = secsTotal % 60;

    const yEl = document.getElementById('cd-years');
    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-mins');
    const sEl = document.getElementById('cd-secs');

    if (yEl) yEl.innerHTML = `${years.toString().padStart(2, '0')}<small>yrs</small>`;
    if (dEl) dEl.innerHTML = `${days.toString().padStart(3, '0')}<small>days</small>`;
    if (hEl) hEl.innerHTML = `${hours.toString().padStart(2, '0')}<small>hrs</small>`;
    if (mEl) mEl.innerHTML = `${mins.toString().padStart(2, '0')}<small>mins</small>`;
    if (sEl) sEl.innerHTML = `${secs.toString().padStart(2, '0')}<small>secs</small>`;
  }

  update();
  setInterval(update, 1000);
}

// Expose triggerPayment globally for inline handlers
(window as any).triggerPayment = triggerPayment;

// --- RSS Feed Logic ---
async function loadRSSFeed(feedUrl: string) {
  const newsFeedList = document.getElementById('newsFeedList');
  if (!newsFeedList) return;

  newsFeedList.innerHTML = `
    <div class="news-item-shell is-visible" style="grid-column: 1 / -1; text-align: center;">
      <div class="news-item-core">
        <div class="news-item-title" style="color: var(--text-muted);">Loading premium feed...</div>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
    const data = await res.json();
    
    if (data.status !== 'ok') throw new Error('RSS fetch failed');

    newsFeedList.innerHTML = '';
    
    data.items.slice(0, 8).forEach((item: any, idx: number) => {
      // Calculate delay based on index for staggered animation
      const animDelay = (idx % 4) * 0.15;
      
      const pubDate = new Date(item.pubDate).toLocaleDateString(undefined, { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });

      const articleHtml = `
        <article class="news-item-shell" style="transition-delay: ${animDelay}s;">
          <div class="news-item-core">
            <div class="news-item-header">
              <span class="news-item-eyebrow">${data.feed.title || 'News'}</span>
              <span class="news-item-date">${pubDate}</span>
            </div>
            <h3 class="news-item-title">${item.title}</h3>
            
            <a href="${item.link}" target="_blank" rel="noopener noreferrer" class="news-cta-btn">
              Read Article
              <span class="news-cta-icon">
                <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </a>
          </div>
        </article>
      `;
      newsFeedList.innerHTML += articleHtml;
    });

    // Set up Intersection Observer for scroll animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.news-item-shell').forEach(el => observer.observe(el));

  } catch (err) {
    console.error('Failed to load RSS:', err);
    newsFeedList.innerHTML = `
      <div class="news-item-shell is-visible" style="grid-column: 1 / -1; text-align: center;">
        <div class="news-item-core">
          <div class="news-item-title" style="color: var(--danger-color);">Failed to load news feed.</div>
        </div>
      </div>
    `;
  }
}

// Initialize RSS Selector
function initRSSSelector() {
  const selector = document.getElementById('rssFeedSelector') as HTMLSelectElement | null;
  if (!selector) return;

  // Load saved preference
  const savedRss = localStorage.getItem('user_rss_preference');
  if (savedRss) {
    const optionExists = Array.from(selector.options).some(opt => opt.value === savedRss);
    if (optionExists) {
      selector.value = savedRss;
    }
  }

  // Load initial feed
  loadRSSFeed(selector.value);

  // Listen for changes
  selector.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    const newFeed = target.value;
    
    // Save to localStorage
    localStorage.setItem('user_rss_preference', newFeed);
    
    // Attempt to save to backend DB (fire-and-forget mock)
    if (typeof BACKEND_URL !== 'undefined') {
      fetch(`${BACKEND_URL}/user/rss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rssUrl: newFeed })
      }).catch(() => { /* ignore backend failure if it doesn't exist yet */ });
    }

    // Reload feed
    loadRSSFeed(newFeed);
  });
}

// --- Local RAG Worker Integration ---
function initRAGSearch() {
  const ragInput = document.getElementById('ragTokenSearchInput') as HTMLInputElement | null;
  const ragResults = document.getElementById('ragSearchResults');
  const swapTargetSelect = document.getElementById('swapTargetToken') as HTMLSelectElement | null;

  if (ragInput && ragResults && swapTargetSelect) {
    let ragWorker: Worker | null = null;
    
    // Initialize worker
    try {
      ragWorker = new Worker(new URL('./workers/rag.worker.ts', import.meta.url), { type: 'module' });
      ragWorker.postMessage({ type: 'init' });
      
      ragWorker.onmessage = (e) => {
        const { status, results, progress } = e.data;
        
        if (status === 'loading_model' || status === 'loading_tokens' || status === 'embedding_tokens') {
          ragInput.placeholder = `✨ RAG Init: ${status} ${progress ? Math.round(progress) + '%' : ''}...`;
        } else if (status === 'embedding_ready') {
          ragInput.placeholder = `✨ RAG Search (e.g. 'stablecoin on base', 'meme coin')`;
        } else if (status === 'search_results') {
          renderRagResults(results);
        }
      };
    } catch (err) {
      console.warn("RAG Worker init failed", err);
      ragInput.placeholder = "RAG search unavailable";
      ragInput.disabled = true;
    }

    let debounceTimer: any;
    ragInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      if (query.length < 2) {
        ragResults.classList.remove('active');
        return;
      }
      
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        ragResults.innerHTML = '<div class="rag-loading">Thinking...</div>';
        ragResults.classList.add('active');
        ragWorker?.postMessage({ type: 'search', query });
      }, 300); // 300ms debounce
    });
    
    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!ragInput.contains(e.target as Node) && !ragResults.contains(e.target as Node)) {
        ragResults.classList.remove('active');
      }
    });

    function renderRagResults(results: any[]) {
      if (!results || results.length === 0) {
        ragResults!.innerHTML = '<div class="rag-loading">No semantic match found</div>';
        return;
      }
      
      ragResults!.innerHTML = '';
      results.forEach((item) => {
        const { token, score } = item;
        const div = document.createElement('div');
        div.className = 'rag-result-item';
        div.innerHTML = `
          <img class="rag-result-icon" src="${token.logoURI || ''}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>'">
          <div class="rag-result-info">
            <span class="rag-result-symbol">${token.symbol} (${Math.round(score * 100)}% match)</span>
            <span class="rag-result-name">${token.name} on Chain ${token.chainId}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          // Add to SUPPORTED_TOKENS dynamically if not exists
          if (typeof SUPPORTED_TOKENS !== 'undefined') {
            const exists = SUPPORTED_TOKENS.find(t => t.symbol === token.symbol);
            if (!exists) {
              SUPPORTED_TOKENS.push({
                symbol: token.symbol,
                name: token.name,
                address: token.address,
                decimals: token.decimals || 18,
                priceUSD: parseFloat(token.priceUSD) || 0
              });
            }
          }
          
          // Add to select options
          const optExists = Array.from(swapTargetSelect!.options).some(o => o.value === token.symbol);
          if (!optExists) {
            const opt = document.createElement('option');
            opt.value = token.symbol;
            opt.text = `${token.symbol} (RAG Discovered)`;
            swapTargetSelect!.appendChild(opt);
          }
          
          // Select it
          swapTargetSelect!.value = token.symbol;
          ragInput!.value = '';
          ragResults!.classList.remove('active');
          
          // Trigger select change logic
          swapTargetSelect!.dispatchEvent(new Event('change'));
        });
        ragResults!.appendChild(div);
      });
    }
  }
}

// Run init when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initRSSSelector();
  initRAGSearch();
});
