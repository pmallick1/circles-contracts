const truffleContract = require('truffle-contract');
const { assertRevert } = require('./helpers/assertRevert');
const { executeSafeTx } = require('./helpers/executeSafeTx');
const expectEvent = require('./helpers/expectEvent');
const safeArtifacts = require('@circles/safe-contracts/build/contracts/GnosisSafe.json');
const proxyArtifacts = require('@circles/safe-contracts/build/contracts/ProxyFactory.json');
const { BigNumber, ZERO_ADDRESS } = require('./helpers/constants');
const { getTimestampFromTx } = require('./helpers/getTimestamp');
const { bn } = require('./helpers/math');

require('chai')
  .use(require('chai-bn')(BigNumber))
  .should();

const Hub = artifacts.require('MockHub');
const Token = artifacts.require('Token');
const GnosisSafe = truffleContract(safeArtifacts);
const ProxyFactory = truffleContract(proxyArtifacts);
GnosisSafe.setProvider(web3.currentProvider);
ProxyFactory.setProvider(web3.currentProvider);

contract('Hub - signup and permissions', ([_, systemOwner, attacker, safeOwner, normalUser, thirdUser, fourthUser]) => { // eslint-disable-line no-unused-vars
  let hub = null;
  let safe = null;
  let proxyFactory = null;

  const inflation = bn(275);
  const period = bn(7885000000);
  const symbol = 'CRC';
  const initialPayout = bn(100);
  const initialIssuance = bn(100);
  const tokenName = 'testToken';

  const gas = 6721975;

  beforeEach(async () => {
    hub = await Hub.new(systemOwner, inflation, period, symbol, initialPayout, initialIssuance,
      { from: systemOwner, gas: 0xfffffffffff });
    safe = await GnosisSafe.new({ from: systemOwner });
    proxyFactory = await ProxyFactory.new({ from: systemOwner });
    await safe.setup([systemOwner], 1, ZERO_ADDRESS, '0x', ZERO_ADDRESS, 0, ZERO_ADDRESS, { from: systemOwner });
  });

  it('has the correct owner', async () => {
    (await hub.owner()).should.be.equal(systemOwner);
  });

  it('attacker cannot change owner', async () => {
    await assertRevert(hub.changeOwner(attacker, { from: attacker }));
  });

  it('has an inflation rate', async () => {
    (await hub.inflation()).should.be.bignumber.equal(inflation);
  });

  it('attacker cannot change inflation', async () => {
    await assertRevert(hub.updateInflation(42, { from: attacker }));
  });

  it('has an starting rate', async () => {
    (await hub.initialIssuance()).should.be.bignumber.equal(initialIssuance);
  });

  it('attacker cannot change initialIssuance', async () => {
    await assertRevert(hub.updateRate(42, { from: attacker }));
  });

  it('has a symbol', async () => {
    (await hub.symbol()).should.be.equal(symbol);
  });

  it('attacker cannot change symbol', async () => {
    await assertRevert(hub.updateSymbol('PLUM', { from: attacker }));
  });

  it('has the right deployed time', async () => {
    const timestamp = await getTimestampFromTx(hub.transactionHash, web3);
    const deployed = await hub.deployedAt();
    (bn(timestamp)).should.be.bignumber.equal(deployed);
  });

  describe('owner can change system vars', async () => {
    after(async () => {
      await hub.updateInflation(inflation, { from: systemOwner });
      await hub.updateSymbol(symbol, { from: systemOwner });
      await hub.updateRate(initialIssuance, { from: systemOwner });
    });

    it('owner can change inflation', async () => {
      await hub.updateRate(1, { from: systemOwner });
      (await hub.initialIssuance()).should.be.bignumber.equal(bn(1));
    });

    it('owner can change inflation', async () => {
      await hub.updateInflation(1, { from: systemOwner });
      (await hub.inflation()).should.be.bignumber.equal(bn(1));
    });

    it('owner can change symbol', async () => {
      await hub.updateSymbol('PLUM', { from: systemOwner });
      (await hub.symbol()).should.be.equal('PLUM');
    });
  });

  describe('new user can signup, when user is an external account', async () => {
    beforeEach(async () => {
      await hub.signup(tokenName, { from: safeOwner });
    });

    it('signup emits an event with correct sender', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });
      const event = expectEvent.inLogs(logs, 'Signup', {
        user: safeOwner,
      });

      return event.args.user.should.equal(safeOwner);
    });

    it('token is owned by correct sender', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: safeOwner,
      });

      tokenAddress = event.args.token;
      token = await Token.at(tokenAddress);
      (await token.owner()).should.be.equal(safeOwner);
    });

    it('token has the correct name', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: safeOwner,
      });

      tokenAddress = event.args.token;
      token = await Token.at(tokenAddress);
      (await token.name()).should.be.equal(tokenName);
    });

    it('throws if sender tries to sign up twice', async () => {
      await assertRevert(hub.signup(tokenName, { from: safeOwner }));
    });
  });

  describe('new user can signup, when user is a safe', async () => {
    beforeEach(async () => {
      const txParams = {
        to: hub.address,
        data: await hub.contract.methods.signup(tokenName).encodeABI(),
      };
      await executeSafeTx(safe, txParams, systemOwner, gas, systemOwner, web3);
    });

    it('signup emits an event with correct sender', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: safe.address,
      });

      return event.args.user.should.equal(safe.address);
    });

    it('token is owned by correct sender', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: safe.address,
      });

      tokenAddress = event.args.token;
      token = await Token.at(tokenAddress);
      (await token.owner()).should.be.equal(safe.address);
    });

    it('token has the correct name', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: safe.address,
      });

      tokenAddress = event.args.token;
      token = await Token.at(tokenAddress);
      (await token.name()).should.be.equal(tokenName);
    });

    it('throws if sender tries to sign up twice', async () => {
      const txParams = {
        to: hub.address,
        data: await hub.contract.methods.signup(tokenName).encodeABI(),
      };
      await executeSafeTx(safe, txParams, systemOwner, gas, systemOwner, web3);

      const logs = await safe.getPastEvents('ExecutionFailed', { fromBlock: 0, toBlock: 'latest' });

      return expect(logs).to.have.lengthOf(1);
    });
  });

  describe('new user can signup, when user is a safe proxy', async () => {
    let userSafe = null;
    let token = null;

    beforeEach(async () => {
      const proxyData = safe.contract
        .methods.setup([safeOwner], 1, ZERO_ADDRESS, '0x', ZERO_ADDRESS, 0, ZERO_ADDRESS)
        .encodeABI();

      const tx = await proxyFactory
        .createProxy(safe.address, proxyData, { from: safeOwner, gas });

      const { logs } = tx;

      const userSafeAddress = logs[0].args.proxy;

      userSafe = await GnosisSafe.at(userSafeAddress);

      const txParams = {
        to: hub.address,
        data: await hub.contract.methods.signup(tokenName).encodeABI(),
      };
      await executeSafeTx(userSafe, txParams, safeOwner, gas, safeOwner, web3);
    });

    it('signup emits an event with correct sender', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: userSafe.address,
      });

      return event.args.user.should.equal(userSafe.address);
    });

    it('token is owned by correct sender', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: userSafe.address,
      });

      tokenAddress = event.args.token;
      token = await Token.at(tokenAddress);

      (await token.owner()).should.be.equal(userSafe.address);
    });

    it('token has the correct name', async () => {
      const logs = await hub.getPastEvents('Signup', { fromBlock: 0, toBlock: 'latest' });

      const event = expectEvent.inLogs(logs, 'Signup', {
        user: userSafe.address,
      });

      tokenAddress = event.args.token;
      token = await Token.at(tokenAddress);
      (await token.name()).should.be.equal(tokenName);
    });

    it('throws if sender tries to sign up twice', async () => {
      const txParams = {
        to: hub.address,
        data: await hub.contract.methods.signup(tokenName).encodeABI(),
      };
      await executeSafeTx(userSafe, txParams, safeOwner, gas, safeOwner, web3);

      const logs = await userSafe.getPastEvents('ExecutionFailed', { fromBlock: 0, toBlock: 'latest' });

      return expect(logs).to.have.lengthOf(1);
    });
  });
});
