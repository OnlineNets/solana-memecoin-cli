const { AuthorityType, setAuthority } = require("@solana/spl-token");
const bs58 = require("bs58");
const fs = require("fs");
const { Connection, PublicKey, Keypair } = require("@solana/web3.js");
const { program } = require("commander");
const { connection, dev_connection } = require("../helpers/config");
const { loadOrCreateKeypair_wallet } = require("../helpers/util");
const { wallet } = require("../helpers/config");

let newConnection = null;
let payer_keypair_path = null,
  token_address = null,
  mint = false,
  freeze = false;
program
  .option("--payer <PATH_TO_SECRET_KEY>", "Specify the path to the secret key")
  .option("--token_address <ADDRESS_TOKEN>", "Specify the token address")
  .option("--cluster <CLUSTER>", "Specify the cluster")
  .option("-m, --mint", "Specify the mint")
  .option("-f, --freeze", "Specify the freeze")
  .option("-h, --help", "display help for command")
  .action((options) => {
    if (options.help) {
      console.log(
        "node revoke_authority --payer <PATH_TO_SECRET_KEY> --mint_address <ADDRESS_TOKEN> --cluster <CLUSTER> --mint --freeze"
      );
      process.exit(0);
    }
    if (!options.token_address || !options.cluster) {
      console.error("❌ Missing required options");
      process.exit(1);
    }
    if (options.payer) {
      payer_keypair_path = options.payer;
    }
    token_address = options.token_address;
    if (options.mint) {
      mint = true;
    }
    if (options.freeze) {
      freeze = true;
    }
    cluster = options.cluster;
    if (cluster === "devnet") {
      newConnection = connection;
    } else if (cluster === "mainnet") {
      newConnection = dev_connection;
    } else {
      console.error("❌ Cluster not supported");
      process.exit(1);
    }
  });
program.parse();

/**
 * Revokes the mint authority for a given mint.
 * @param {string} mint - The mint address.
 * @param {string} payer - The payer address.
 * @param {string} owner - The owner address.
 * @returns {Promise<void>} - A promise that resolves when the mint authority is revoked.
 */
async function revokeMint(mint, payer, owner) {
  console.log("Disabling the mint authority...");
  await setAuthority(
    newConnection,
    payer,
    mint,
    owner,
    AuthorityType.MintTokens,
    null
  ).catch((error) => {
    console.error(error);
    console.log("Error: try again...");
    revokeMint(mint, payer, owner);
  });
}
/**
 * Disables the freeze authority for a given mint and owner.
 * @param {string} mint - The mint address.
 * @param {string} payer - The payer address.
 * @param {string} owner - The owner address.
 * @returns {Promise<void>} - A promise that resolves when the freeze authority is disabled.
 */
async function revokeFreeze(mint, payer, owner) {
  console.log("Disabling the freeze authority...");
  await setAuthority(
    newConnection,
    payer,
    mint,
    owner,
    AuthorityType.FreezeAccount,
    null
  ).catch((error) => {
    console.error(error);
    console.log("Error: try again...");
    revokeFreeze(mint, payer, owner);
  });
}

/**
 * Revoke authority for a token.
 * @async
 * @function revokeAuthority
 * @returns {Promise<void>}
 */
async function revokeAuthority() {
  // let payer_wallet = null;
  // if (payer_keypair !== null) {
  //   payer_wallet = await loadOrCreateKeypair_wallet(payer_keypair);
  //   await swap(side, address, no_of_sol, -1, payer_wallet);
  // } else {
  //   await swap(side, address, no_of_sol, -1, wallet);
  // }
  let payer_wallet = null;
  const token_mint = new PublicKey(token_address);
  if (payer_keypair_path !== null) {
    payer_wallet = await loadOrCreateKeypair_wallet(payer_keypair_path);
    if (mint) {
      await revokeMint(token_mint, payer_wallet, payer_wallet);
    }
    if (freeze) {
      await revokeFreeze(token_mint, payer_wallet, payer_wallet);
    }
  } else {
    if (mint) {
      await revokeMint(token_mint, payer_wallet, wallet);
    }
    if (freeze) {
      await revokeFreeze(token_mint, payer_wallet, wallet);
    }
  }
}

revokeAuthority();
