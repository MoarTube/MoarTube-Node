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
  const settingsModal = new bootstrap.Modal($('settings-dialog'));
  $('navbar-settings-button').onclick = () => settingsModal.show();
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
  $('navbar-donate-button').onclick = () => {
    if (!window.ethereum) {
      void Swal.fire({
        title: 'Missing Crypto Wallet',
        html: "Your browser doesn't have a supported crypto wallet installed.<br>MoarTube supports crypto wallets that conform to the EIP-1193 standard.<br>Would you like to be directed to a supported crypto wallet?",
        width: 'auto',
        icon: 'info',
        showCloseButton: true,
        showCancelButton: true,
        confirmButtonText: '<a id="wallet-install" href="https://metamask.io/download" target="_blank" rel="noopener noreferrer" style="text-decoration: none; color: white;">Continue</a>',
      });
      return;
    }
    wallets = [];
    void Swal.fire({
      title: 'Donate to Creator',
      html: $('donate-content').innerHTML,
      width: 'auto',
      showCloseButton: true,
      showCancelButton: true,
      confirmButtonText: 'Continue',
      didOpen: async (popup) => {
        const confirm = Swal.getConfirmButton();
        confirm.id = 'donation-continue';
        confirm.disabled = true;
        $('donate-status').textContent = 'Loading donation addresses...';
        $('wallet-address-select').onchange = updateCurrency;
        $('donation-amount-input').oninput = updateContinue;
        $('donate-form').onsubmit = (event) => { event.preventDefault(); Swal.clickConfirm(); };
        try {
          const data = await read('/monetization/all');
          if (!popup.isConnected) return;
          wallets = data.cryptoWalletAddresses || [];
          $('wallet-address-select').append(...wallets.map((wallet, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = wallet.wallet_address + ' (' + wallet.chain + ')';
            return option;
          }));
          $('donate-status').textContent = wallets.length ? '' : 'This node has no donation addresses configured.';
          $('donate-form').hidden = !wallets.length;
        } catch (error) {
          if (popup.isConnected) $('donate-status').textContent = error.message;
        }
      },
      preConfirm: async () => { await submitDonation(); return false; },
    });
  };
  function updateCurrency() {
    const selected = $('wallet-address-select').value;
    const wallet = selected === '' ? undefined : wallets[Number(selected)];
    $('donation-amount-input').disabled = !wallet;
    $('donation-amount-input').placeholder = wallet ? 'donation amount (' + wallet.currency + ')' : 'donation amount';
    updateContinue();
  }
  function updateContinue() {
    $('donation-continue').disabled = $('wallet-address-select').value === '' || $('donation-amount-input').value.trim() === '';
  }
  async function submitDonation() {
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
    const popup = Swal.getPopup();
    $('donation-continue').disabled = true;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: wallet.chain_id }] });
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.[0]) throw new Error('No wallet account selected.');
      await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ to: wallet.wallet_address, from: accounts[0], value: '0x' + value.toString(16) }] });
      if (popup.isConnected) $('donate-status').textContent = 'Transaction submitted to your wallet.';
    } catch (error) {
      if (popup.isConnected) $('donate-status').textContent = error.message || 'Unable to open wallet.';
    }
    finally { if (popup.isConnected) updateContinue(); }
  }
})();
