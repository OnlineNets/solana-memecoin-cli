const assert = require("assert");

const {
  Liquidity,
  Percent,
  Token,
  TOKEN_PROGRAM_ID,
  TokenAmount,
} = require("@raydium-io/raydium-sdk");
const {
  PublicKey,
  TransactionMessage,
  ComputeBudgetProgram,
  VersionedTransaction,
} = require("@solana/web3.js");
const { Decimal } = require("decimal.js");
const { BN } = require("@project-serum/anchor");
const { getSPLTokenBalance } = require("../helpers/check_balance.js");
const {
  connection,
  DEFAULT_TOKEN,
  makeTxVersion,
  RAYDIUM_MAINNET_API,
  _ENDPOINT,
  wallet,
  jito_fee,
} = require("../helpers/config.js");
const {
  getDecimals,
  getTokenMetadata,
  checkTx,
} = require("../helpers/util.js");
const { getPoolId, getPoolIdByPair } = require("./query_pool.js");
const {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
} = require("@solana/spl-token");
const { mint } = require("@metaplex-foundation/mpl-candy-machine");
const { formatAmmKeysById_swap } = require("./formatAmmKeysById.js");
const {
  simple_executeAndConfirm,
} = require("../Transactions/simple_tx_executor.js");
const {
  jito_executeAndConfirm,
} = require("../Transactions/jito_tips_tx_executor.js");

/**
 * Performs a swap operation using an Automated Market Maker (AMM) pool in Raydium.
 * @param {Object} input - The input parameters for the swap operation.
 * @returns {Object} - The transaction IDs of the executed swap operation.
 */
async function swapOnlyAmm(input) {
  // -------- pre-action: get pool info --------\

  const poolKeys = await formatAmmKeysById_swap(
    new PublicKey(input.targetPool)
  );
  assert(poolKeys, "cannot find the target pool");
  const poolInfo = await Liquidity.fetchInfo({
    connection: connection,
    poolKeys: poolKeys,
  });
  // -------- step 1: coumpute amount out --------
  const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
    poolKeys: poolKeys,
    poolInfo: poolInfo,
    amountIn: input.inputTokenAmount,
    currencyOut: input.outputToken,
    slippage: input.slippage,
  });
  // -------- step 2: create instructions by SDK function --------
  const { innerTransaction } = await Liquidity.makeSwapFixedInInstruction(
    {
      poolKeys: poolKeys,
      userKeys: {
        tokenAccountIn: input.ataIn,
        tokenAccountOut: input.ataOut,
        owner: wallet.publicKey,
      },
      amountIn: input.inputTokenAmount.raw,
      minAmountOut: minAmountOut.raw,
    },
    poolKeys.version
  );
  if (input.usage == "volume") return innerTransaction;
  const latestBlockhash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [
      ...[
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 2000,
        }),
      ],
      ...(input.side === "buy"
        ? [
            createAssociatedTokenAccountIdempotentInstruction(
              wallet.publicKey,
              input.ataOut,
              wallet.publicKey,
              input.outputToken.mint
            ),
          ]
        : []),
      ...innerTransaction.instructions,
      ...(input.side === "sell" && input.sell_PercentageOfToken === 100
        ? [
            createCloseAccountInstruction(
              input.ataIn,
              wallet.publicKey,
              wallet.publicKey
            ),
          ]
        : []),
    ],
  });

  const transaction = new VersionedTransaction(messageV0.compileToV0Message());
  transaction.sign([wallet, ...innerTransaction.signers]);
  let signature = null,
    confirmed = null;
  try {
    const res = await jito_executeAndConfirm(
      transaction,
      wallet,
      latestBlockhash,
      jito_fee
    );
    signature = res.signature;
    confirmed = res.confirmed;
    if (signature == null) {
      console.log("jito fee transaction failed");
      console.log("trying to send the transaction again...");
      return await swapOnlyAmm(input);
    }
  } catch (e) {
    console.log(e);
    return { txid: e.signature };
  }
  if (signature == null) {
    console.log("jito fee transaction failed");
    console.log("trying to send the transaction again...");
    return await swapOnlyAmm(input);
  }
  return { txid: signature };
}

/**
 * Swaps tokens for volume, buying and selling a token in one transaction.
 * @param {string} tokenAddr - The address of the token to swap.
 * @param {number} sol_per_order - The price of SOL per order.
 * @returns {Promise<{confirmed: boolean, txid: string}>} - The confirmation status and transaction ID.
 */
async function swapForVolume(tokenAddr, sol_per_order) {
  const buy_instruction = await swap(
    "buy",
    tokenAddr,
    sol_per_order,
    -1,
    wallet,
    "volume"
  );
  const sell_instruction = await swap(
    "sell",
    tokenAddr,
    -1,
    100,
    wallet,
    "volume"
  );
  const latestBlockhash = await connection.getLatestBlockhash();
  const messageV0 = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: [
      ...[
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200000,
        }),
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 9000,
        }),
      ],
      ...buy_instruction.instructions,
      ...sell_instruction.instructions,
    ],
  });

  const transaction = new VersionedTransaction(messageV0.compileToV0Message());
  transaction.sign([
    wallet,
    ...buy_instruction.signers,
    ...sell_instruction.signers,
  ]);
  let signature = null,
    confirmed = null;
  try {
    const res = await simple_executeAndConfirm(
      transaction,
      wallet,
      latestBlockhash
    );
    signature = res.signature;
    confirmed = res.confirmed;
  } catch (e) {
    console.log(e);
    return { confirmed: confirmed, txid: e.signature };
  }
  return { confirmed: confirmed, txid: signature };
}

/**
 * Performs a swap operation that retries the transaction if it fails.
 *
 * @param {string} side - The side of the swap operation ("buy" or "sell").
 * @param {string} tokenAddr - The address of the token.
 * @param {number} buy_AmountOfSol - The amount of SOL to buy (only applicable for "buy" side).
 * @param {number} sell_PercentageOfToken - The percentage of token to sell (only applicable for "sell" side).
 * @returns {Promise<void>} - A promise that resolves when the swap operation is completed.
 */

async function swapOnlyAmmHelper(input) {
  const { txid } = await swapOnlyAmm(input);
  console.log("txids:", txid);
  const response = await checkTx(txid);
  if (response) {
    if (input.side === "buy") {
      console.log(
        `https://dexscreener.com/solana/${input.targetPool}?maker=${wallet.publicKey}`
      );
    } else {
      console.log(
        `https://dexscreener.com/solana/${input.targetPool}?maker=${wallet.publicKey}`
      );
    }
    console.log(`https://solscan.io/tx/${txid}?cluster=mainnet`);
  } else {
    console.log("Transaction failed");
    console.log("trying to send the transaction again");
    swapOnlyAmmHelper(input);
  }
}
/**
 * Performs a swap operation.
 *
 * @param {string} side - The side of the swap operation ("buy" or "sell").
 * @param {string} tokenAddr - The address of the token involved in the swap.
 * @param {number} buy_AmountOfSol - The amount of SOL to buy (only applicable for "buy" side).
 * @param {number} sell_PercentageOfToken - The percentage of the token to sell (only applicable for "sell" side).
 * @param {object} payer_wallet - The payer's wallet object.
 * @returns {Promise<void>} - A promise that resolves when the swap operation is completed.
 */
async function swap(
  side,
  tokenAddr,
  buy_AmountOfSol,
  sell_PercentageOfToken,
  payer_wallet,
  usage
) {
  const tokenAddress = tokenAddr;
  const tokenAccount = new PublicKey(tokenAddress);
  const mintAta = await getAssociatedTokenAddress(
    tokenAccount,
    wallet.publicKey
  );
  const quoteAta = await getAssociatedTokenAddressSync(
    Token.WSOL.mint,
    wallet.publicKey
  );
  if (side === "buy") {
    // buy - use sol to swap to the token

    //const { tokenName, tokenSymbol } = await getTokenMetadata(tokenAddress);
    const outputToken = new Token(
      TOKEN_PROGRAM_ID,
      tokenAccount,
      await getDecimals(tokenAccount)
    );
    const inputToken = DEFAULT_TOKEN.WSOL; // SOL
    const targetPool = await getPoolIdByPair(tokenAddress);
    if (targetPool === null) {
      console.log(
        "Pool not found or raydium is not supported for this token. Exiting..."
      );
      return;
    }
    const amountOfSol = new Decimal(buy_AmountOfSol);
    const inputTokenAmount = new TokenAmount(
      inputToken,
      new BN(amountOfSol.mul(10 ** inputToken.decimals).toFixed(0))
    );
    const slippage = new Percent(1, 100);
    const input = {
      outputToken,
      targetPool,
      inputTokenAmount,
      slippage,
      ataIn: quoteAta,
      ataOut: mintAta,
      side,
      usage,
    };
    if (usage == "volume") {
      return await swapOnlyAmm(input);
    }
    swapOnlyAmmHelper(input);
  } else {
    // sell
    const { tokenName, tokenSymbol } = await getTokenMetadata(tokenAddress);
    const inputToken = new Token(
      TOKEN_PROGRAM_ID,
      tokenAccount,
      await getDecimals(tokenAccount),
      tokenSymbol,
      tokenName
    );
    const outputToken = DEFAULT_TOKEN.WSOL; // SOL
    const targetPool = await getPoolIdByPair(tokenAddress);
    if (targetPool === null) {
      console.log(
        "Pool not found or raydium is not supported for this token. Exiting..."
      );
      return;
    }

    const balnaceOfToken = await getSPLTokenBalance(
      connection,
      tokenAccount,
      wallet.publicKey
    );
    const percentage = sell_PercentageOfToken / 100;
    const amount = new Decimal(percentage * balnaceOfToken);
    const slippage = new Percent(1, 1000);
    const inputTokenAmount = new TokenAmount(
      inputToken,
      new BN(amount.mul(10 ** inputToken.decimals).toFixed(0))
    );
    const input = {
      outputToken,
      sell_PercentageOfToken,
      targetPool,
      inputTokenAmount,
      slippage,
      wallet: payer_wallet,
      ataIn: mintAta,
      ataOut: quoteAta,
      side,
      usage,
    };
    if (usage == "volume") {
      return await swapOnlyAmm(input);
    }
    swapOnlyAmmHelper(input);
  }
}

module.exports = { swap, swapForVolume };
