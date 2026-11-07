/* Shared viewer conventions: public links, EIP-1193 donations, persisted dark mode. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const theme = (dark) => {
    document.body.classList.toggle('home-dark', dark);
    $('darkModeSwitch').checked = dark;
  };
  try { theme(localStorage.getItem('dark-mode-enabled') === 'true'); } catch { theme(false); }
  for (const id of ['navbar-settings-button', 'navbar-donate-button']) {
    $(id).onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $(id).click(); }
    };
  }
  $('navbar-settings-button').onclick = () => $('settings-dialog').showModal();
  $('darkModeSwitch').onchange = () => {
    const dark = $('darkModeSwitch').checked;
    theme(dark);
    try { localStorage.setItem('dark-mode-enabled', String(dark)); } catch { /* Storage may be disabled. */ }
  };
  async function read(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load node information. Please retry.');
    const result = await response.json();
    if (result.isError) throw new Error(result.message || 'Unable to load node information.');
    return result;
  }
  void read('/links/all').then(({ links = [] }) => {
    for (const item of links) {
      let url;
      try { url = new URL(item.url); } catch { continue; }
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      const link = document.createElement('a');
      link.className = 'navbar-settings-button navbar-brand';
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', url.hostname);
      const image = document.createElement('img');
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item.svg_graphic || '');
      image.alt = '';
      link.append(image);
      $('viewer-links').append(link);
    }
  }).catch(() => { /* Optional links must not prevent browsing. */ });
  let wallets = [];
  let loading = false;
  $('navbar-donate-button').onclick = async () => {
    $('donate-dialog').showModal();
    if (loading) return;
    $('donate-form').hidden = true;
    $('wallet-install').hidden = true;
    if (!window.ethereum) {
      $('donate-status').textContent = 'Your browser does not have a supported crypto wallet installed. MoarTube supports EIP-1193 wallets.';
      $('wallet-install').hidden = false;
      return;
    }
    loading = true;
    $('donate-status').textContent = 'Loading donation addresses...';
    try {
      const data = await read('/monetization/all');
      wallets = data.cryptoWalletAddresses || [];
      $('wallet-address-select').replaceChildren(...wallets.map((wallet, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = wallet.wallet_address + ' (' + wallet.chain + ')';
        return option;
      }));
      $('donate-status').textContent = wallets.length ? '' : 'This node has no donation addresses configured.';
      $('donate-form').hidden = !wallets.length;
      $('donation-amount-input').value = '';
      updateCurrency();
    } catch (error) { $('donate-status').textContent = error.message; }
    finally { loading = false; }
  };
  function updateCurrency() {
    const wallet = wallets[Number($('wallet-address-select').value)];
    $('donation-amount-input').placeholder = wallet ? 'Amount (' + wallet.currency + ')' : 'Amount';
  }
  $('wallet-address-select').onchange = updateCurrency;
  $('donate-form').onsubmit = async (event) => {
    event.preventDefault();
    const amount = $('donation-amount-input').value.trim();
    if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) {
      $('donate-status').textContent = 'Enter a positive amount with up to 18 decimal places.';
      return;
    }
    const [whole, fraction = ''] = amount.split('.');
    const value = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
    if (value <= 0n) { $('donate-status').textContent = 'Enter an amount greater than zero.'; return; }
    const wallet = wallets[Number($('wallet-address-select').value)];
    if (!wallet || !window.ethereum) return;
    $('donation-continue').disabled = true;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: wallet.chain_id }] });
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.[0]) throw new Error('No wallet account selected.');
      await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ to: wallet.wallet_address, from: accounts[0], value: '0x' + value.toString(16) }] });
      $('donate-status').textContent = 'Transaction submitted to your wallet.';
    } catch (error) { $('donate-status').textContent = error.message || 'Unable to open wallet.'; }
    finally { $('donation-continue').disabled = false; }
  };
})();
