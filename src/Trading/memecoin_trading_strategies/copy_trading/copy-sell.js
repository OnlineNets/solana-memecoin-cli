const {
    PublicKey,
  } = require("@solana/web3.js");
  const {
    TOKEN_PROGRAM_ID,
    AccountLayout,
  } = require("@solana/spl-token");
  const fs = require('fs');
  const { wallet, second_connection, smart_money_wallet } = require("../../../helpers/config");
  //const { buy } = require("../../dex/jupiter/swap/buy-helper");
  //const { sell } = require("../../dex/jupiter/swap/sell-helper");
  const {sell} = require("../../dex/raydium/sell_helper")
  //const {swap} = require("../../../Pool/swap") 
  var current_trader_wallet_state = {};
  var current_our_wallet_state = {};
  // [usdc, sol, usdt, wsol]
  const wsol = "So11111111111111111111111111111111111111112"
  const quoteToken = [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "SOL",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    wsol,
  ];
  let boughtTokens = JSON.parse(fs.readFileSync('C:\\Users\\User\\Desktop\\solana-memecoin-cli\\src\\Trading\\memecoin_trading_strategies\\copy_trading\\bought-tokens.json', 'utf8'));
console.log(boughtTokens);
function saveToJson() {
    fs.writeFileSync('C:\\Users\\User\\Desktop\\solana-memecoin-cli\\src\\Trading\\memecoin_trading_strategies\\copy_trading\\bought-tokens.json', JSON.stringify(boughtTokens, null, 2));
  }
/**
 * Retrieves the state of a wallet by querying the Solana blockchain.
 * @param {string} wallet_address - The address of the wallet to retrieve the state for.
 * @returns {Object} - An object containing the token balances of the wallet and the SOL balance.
 */
async function retriveWalletState(wallet_address) {
    const filters = [
      {
        dataSize: 165, //size of account (bytes)
      },
      {
        memcmp: {
          offset: 32, //location of our query in the account (bytes)
          bytes: wallet_address, //our search criteria, a base58 encoded string
        },
      },
    ];
    const accounts = await second_connection.getParsedProgramAccounts(
      TOKEN_PROGRAM_ID, //new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
      { filters: filters }
    );
    let results = {};
    const solBalance = await second_connection.getBalance(new PublicKey(wallet_address));
    accounts.forEach((account, i) => {
      //Parse the account data
      const parsedAccountInfo = account.account.data;
      const mintAddress = parsedAccountInfo["parsed"]["info"]["mint"];
      const tokenBalance =
        parsedAccountInfo["parsed"]["info"]["tokenAmount"]["uiAmount"];
  
      results[mintAddress] = tokenBalance;
      results["SOL"] = solBalance / 10 ** 9;
    });
    return results;
  }
async function copy_sell(address){
    // 400 ms to check the wallet state
    // if token we have but trader doesn't have, sell it
    // that's it
    let soldTokens = [];
    let flag = false;
    let possible_cant_sell_token = null
    try{
    if(boughtTokens.length > 0){
    for(let i=0; i<boughtTokens.length; i++){
        let token = boughtTokens[i];
        current_trader_wallet_state = await retriveWalletState(address);
        if(!(token in current_trader_wallet_state) || current_trader_wallet_state[token] == 0){
          console.log(`Selling ${token}...`);
          soldTokens.push(token);
          flag = true;
          await sell("sell", token, 100, wallet);
        }
        }
      


    }
    }catch(err){
      console.log(err);

    }
    if(flag){
      // Update the list with the remaining unsold tokens
      boughtTokens = boughtTokens.filter((token) => !soldTokens.includes(token));
      // Save the updated list back to the JSON file
      saveToJson();
      
    }
      
}
async function main(){
  while(true){
    boughtTokens = JSON.parse(fs.readFileSync('C:\\Users\\User\\Desktop\\solana-memecoin-cli\\src\\Trading\\memecoin_trading_strategies\\copy_trading\\bought-tokens.json', 'utf8'));
    await copy_sell(smart_money_wallet);
    
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
}
main();
module.exports = {copy_sell}
