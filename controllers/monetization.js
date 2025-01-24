const { 
    cloudflare_purgeAllWatchPages, cloudflare_purgeNodePage 
} = require('../utils/cloudflare-communications');
const { 
    performDatabaseReadJob_ALL, performDatabaseReadJob_GET, submitDatabaseWriteJob 
} = require('../utils/database');

async function walletAddressAll_GET() {
    const cryptoWalletAddresses = await performDatabaseReadJob_ALL('SELECT * FROM cryptowalletaddresses', []);

    return { isError: false, cryptoWalletAddresses: cryptoWalletAddresses };
}

async function walletAddressAdd_POST(walletAddress, chain, currency) {
    let chainId = '';

    if (chain === 'ETH') {
        chainId = '0x1';
    }
    else if (chain === 'BNB') {
        chainId = '0x38';
    }

    const timestamp = Date.now();

    await submitDatabaseWriteJob('INSERT INTO cryptowalletaddresses(wallet_address, chain, chain_id, currency, timestamp) VALUES (?, ?, ?, ?, ?)', [walletAddress, chain, chainId, currency, timestamp]);

    cloudflare_purgeAllWatchPages();
    cloudflare_purgeNodePage();

    const cryptoWalletAddress = await performDatabaseReadJob_GET('SELECT * FROM cryptowalletaddresses WHERE timestamp = ?', [timestamp]);

    return { isError: false, cryptoWalletAddress: cryptoWalletAddress };
}

async function walletAddressDelete_POST(cryptoWalletAddressId) {
    await submitDatabaseWriteJob('DELETE FROM cryptowalletaddresses WHERE wallet_address_id = ?', [cryptoWalletAddressId]);

    cloudflare_purgeAllWatchPages();
    cloudflare_purgeNodePage();

    return { isError: false };
}

module.exports = {
    walletAddressAll_GET,
    walletAddressAdd_POST,
    walletAddressDelete_POST
}