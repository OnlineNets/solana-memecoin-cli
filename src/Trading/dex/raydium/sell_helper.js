const { swap } = require("../../../Pool/swap.js");

/**
 * Sells a specified percentage of a token.
 * @param {string} side - The side of the trade (buy or sell).
 * @param {string} address - The address of the token.
 * @param {number} sell_percentage - The percentage of the token to sell.
 * @param {string} payer - The payer of the transaction.
 * @returns {Promise<void>} - A promise that resolves when the sell operation is complete.
 */
async function sell(side, address, sell_percentage, payer) {
  await swap(side, address, -1, sell_percentage, payer);
}
module.exports = { sell };
