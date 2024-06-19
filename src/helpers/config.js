const {
  Currency,
  Token,
  ENDPOINT,
  MAINNET_PROGRAM_ID,
  RAYDIUM_MAINNET,
  TxVersion,
  LOOKUP_TABLE_CACHE,
  TOKEN_PROGRAM_ID,
} = require("@raydium-io/raydium-sdk");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const dotenv = require("dotenv");
const bs58 = require("bs58");
const path = require("path");
// default path: /Users/{your_user_name}/Desktop/Solana-Memecoin-CLI/src/helpers/.env
// please specify your own .env path
dotenv.config({
  path: "/Users/{your_user_name}/Desktop/Solana-Memecoin-CLI/src/helpers/.env", // fill in your .env path
});
function loadKeypairFromFile(filename) {
  const secret = fs.readFileSync(filename, { encoding: "utf8" });
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
}
const jito_fee = process.env.JITO_FEE; // 0.00009 SOL
const shyft_api_key = process.env.SHYFT_API_KEY; // your shyft api key
const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)); // your wallet
const dev_endpoint = process.env.DEVNET_ENDPOINT; // devnet endpoint
const main_endpoint = process.env.MAINNET_ENDPOINT; // mainnet endpoint
const second_main_endpoint = process.env.SECOND_MAINNET_ENDPOINT; // second mainnet endpoint
const RPC_Websocket_endpoint = process.env.WS_ENDPOINT;
const second_RPC_Websocket_endpoint = process.env.SECOND_WS_ENDPOINT;
const smart_money_wallet = process.env.SMART_MONEY_WALLET; // smart money wallet
const connection = new Connection(main_endpoint, {
  wsEndpoint: RPC_Websocket_endpoint,
  commitment: "confirmed",
});
const second_connection = new Connection(second_main_endpoint, {
  wsEndpoint: second_RPC_Websocket_endpoint,
  commitment: "confirmed",
});
const dev_connection = new Connection(dev_endpoint, "confirmed"); // devnet connection

const PROGRAMIDS = MAINNET_PROGRAM_ID; // raydium mainnet program address

const RAYDIUM_MAINNET_API = RAYDIUM_MAINNET; // raydium mainnet program's api

const makeTxVersion = TxVersion.V0; // LEGACY
const _ENDPOINT = ENDPOINT; // raydium mainnet program's base api path
const addLookupTableInfo = LOOKUP_TABLE_CACHE; // only mainnet. other = undefined

const DEFAULT_TOKEN = {
  SOL: new Currency(9, "SOL", "SOL"),
  WSOL: new Token(
    TOKEN_PROGRAM_ID,
    new PublicKey("So11111111111111111111111111111111111111112"),
    9,
    "WSOL",
    "WSOL"
  ),
  USDC: new Token(
    TOKEN_PROGRAM_ID,
    new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    6,
    "USDC",
    "USDC"
  ),
};

module.exports = {
  wallet,
  dev_connection,
  dev_endpoint,
  main_endpoint,
  connection,
  TOKEN_PROGRAM_ID,
  RAYDIUM_MAINNET,
  RAYDIUM_MAINNET_API,
  PROGRAMIDS,
  makeTxVersion,
  DEFAULT_TOKEN,
  addLookupTableInfo,
  _ENDPOINT,
  shyft_api_key,
  jito_fee,
  second_main_endpoint,
  second_connection,
  smart_money_wallet,
};
