const web3 = require('web3'); // eslint-disable-line import/no-extraneous-dependencies

const BigNumber = web3.utils.BN;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const decimals = new BigNumber(18);

module.exports = {
  ZERO_ADDRESS,
  decimals,
  BigNumber,
};
