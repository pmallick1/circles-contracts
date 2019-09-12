// https://github.com/OpenZeppelin/openzeppelin-solidity/blob/master/test/token/ERC20/ERC20.test.js
const truffleContract = require('truffle-contract');

const { assertRevert } = require('./helpers/assertRevert');
const expectEvent = require('./helpers/expectEvent');
const { signTypedData } = require('./helpers/signTypedData');
const { formatTypedData } = require('./helpers/formatTypedData');
const { BigNumber, ZERO_ADDRESS, decimals } = require('./helpers/constants');
const { bn, convert } = require('./helpers/math');

const Hub = artifacts.require('Hub');
const Token = artifacts.require('Token');
const safeArtifacts = require('@gnosis.pm/safe-contracts/build/contracts/GnosisSafe.json');

const GnosisSafe = truffleContract(safeArtifacts);
GnosisSafe.setProvider(web3.currentProvider);

require('chai')
  .use(require('chai-bn')(BigNumber))
  .should();

contract('ERC20', ([_, owner, recipient, anotherAccount, systemOwner]) => { // eslint-disable-line no-unused-vars
  let hub = null;
  let safe = null;
  let token = null;

  const issuance = bn(1736111111111111);
  const demurrage = bn(0);
  const symbol = 'CRC';
  const tokenName = 'MyCoin';
  const initialPayout = convert(100);

  beforeEach(async () => {
    hub = await Hub.new(systemOwner, issuance, demurrage, symbol, initialPayout);
  });

  describe('total supply', () => {
    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    it('returns the total amount of tokens', async () => {
      const balance = convert(100);
      (await token.totalSupply()).should.be.bignumber.equal(balance);
    });
  });

  describe('decimals', () => {
    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    it('tokens always have 18 decimals', async () => {
      (await token.decimals()).should.be.bignumber.equal(decimals);
    });
  });

  describe('balanceOf', () => {
    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    describe('when the requested account has no tokens', () => {
      it('returns zero', async () => {
        (await token.balanceOf(anotherAccount)).should.be.bignumber.equal(bn(0));
      });
    });

    describe('when the requested account has some tokens', () => {
      it('returns the total amount of tokens', async () => {
        const balance = convert(100);
        (await token.balanceOf(owner)).should.be.bignumber.equal(balance);
      });
    });
  });

  describe('transfer', () => {
    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    describe('when the recipient is not the zero address', () => {
      const to = recipient;

      describe('when the sender does not have enough balance', () => {
        const amount = convert(101);

        it('reverts', async () => {
          await assertRevert(token.transfer(to, amount, { from: owner }));
        });
      });

      describe('when the sender has enough balance', () => {
        const amount = convert(100);

        it('transfers the requested amount', async () => {
          await token.transfer(to, amount, { from: owner });

          (await token.balanceOf(owner)).should.be.bignumber.equal(bn(0));

          (await token.balanceOf(to)).should.be.bignumber.equal(amount);
        });

        it('emits a transfer event', async () => {
          const { logs } = await token.transfer(to, amount, { from: owner });

          const event = expectEvent.inLogs(logs, 'Transfer', {
            from: owner,
            to,
          });

          event.args.value.should.be.bignumber.equal(amount);
        });
      });
    });

    describe('when the recipient is the zero address', () => {
      const to = ZERO_ADDRESS;
      it('reverts', async () => {
        const balance = convert(100);
        await assertRevert(token.transfer(to, balance, { from: owner }));
      });
    });
  });

  describe('transfer when owner is a safe', () => {
    const operation = 0;
    const safeTxGas = 0;
    const baseGas = 0;
    const gasPrice = 0;
    const gasToken = ZERO_ADDRESS;
    const refundReceiver = ZERO_ADDRESS;
    const value = 0;

    beforeEach(async () => {
      safe = await GnosisSafe.new({ from: owner });
      await safe.setup([owner], 1, ZERO_ADDRESS, '0x', ZERO_ADDRESS, 0, ZERO_ADDRESS, { from: systemOwner });

      const to = hub.address;
      const data = await hub.contract.methods.signup(tokenName).encodeABI();
      const nonce = (await safe.nonce()).toString();

      const typedData = formatTypedData(
        to, value, data, operation, safeTxGas, baseGas, gasPrice,
        gasToken, refundReceiver, nonce, safe.address);

      const signatureBytes = await signTypedData(owner, typedData, web3);
      await safe.execTransaction(
        to, value, data, operation, safeTxGas, baseGas, gasPrice,
        gasToken, refundReceiver, signatureBytes,
        { from: owner, gas: 17721975 });

      const blockNumber = await web3.eth.getBlockNumber();
      const logs = await hub.getPastEvents('Signup', { fromBlock: blockNumber - 1, toBlock: 'latest' });

      token = await Token.at(logs[0].args.token);
    });

    describe('when the recipient is not the zero address', () => {
      describe('when the sender does not have enough balance', () => {
        it('reverts', async () => {
          const amount = convert(101);
          const to = token.address;
          const data = await token.contract.methods
            .transfer(recipient, amount.toString())
            .encodeABI();
          const nonce = (await safe.nonce()).toString();

          const typedData = formatTypedData(
            to, value, data, operation, safeTxGas, baseGas, gasPrice,
            gasToken, refundReceiver, nonce, safe.address);

          const signatureBytes = await signTypedData(owner, typedData, web3);
          await safe.execTransaction(
            to, value, data, operation, safeTxGas, baseGas, gasPrice,
            gasToken, refundReceiver, signatureBytes,
            { from: owner, gas: 10721975 });

          const blockNumber = await web3.eth.getBlockNumber();
          const logs = await safe.getPastEvents('ExecutionFailed', { fromBlock: blockNumber - 1, toBlock: 'latest' });

          return expect(logs).to.have.lengthOf(1);
        });
      });

      describe('when the sender has enough balance', () => {
        const amount = convert(100);

        it('transfers the requested amount', async () => {
          const to = token.address;
          const data = await token.contract.methods
            .transfer(recipient, amount.toString())
            .encodeABI();
          const nonce = (await safe.nonce()).toString();

          const typedData = formatTypedData(
            to, value, data, operation, safeTxGas, baseGas, gasPrice,
            gasToken, refundReceiver, nonce, safe.address);

          const signatureBytes = await signTypedData(owner, typedData, web3);
          await safe.execTransaction(
            to, value, data, operation, safeTxGas, baseGas, gasPrice,
            gasToken, refundReceiver, signatureBytes,
            { from: owner, gas: 10721975 });

          (await token.balanceOf(safe.address))
            .should.be.bignumber.equal(new BigNumber(0));

          (await token.balanceOf(recipient)).should.be.bignumber.equal(amount);
        });

        it('emits a transfer event', async () => {
          const to = token.address;
          const data = await token.contract.methods
            .transfer(recipient, amount.toString())
            .encodeABI();
          const nonce = (await safe.nonce()).toString();

          const typedData = formatTypedData(
            to, value, data, operation, safeTxGas, baseGas, gasPrice,
            gasToken, refundReceiver, nonce, safe.address);

          const signatureBytes = await signTypedData(owner, typedData, web3);
          await safe.execTransaction(
            to, value, data, operation, safeTxGas, baseGas, gasPrice,
            gasToken, refundReceiver, signatureBytes,
            { from: owner, gas: 10721975 });

          const blockNumber = await web3.eth.getBlockNumber();
          const logs = await token.getPastEvents('Transfer', { fromBlock: blockNumber - 1, toBlock: 'latest' });

          const event = expectEvent.inLogs(logs, 'Transfer', {
            from: safe.address,
            to: recipient,
          });

          event.args.value.should.be.bignumber.equal(amount);
        });
      });
    });

    describe('when the recipient is the zero address', () => {
      const to = ZERO_ADDRESS;
      it('reverts', async () => {
        const balance = convert(100);
        await assertRevert(token.transfer(to, balance, { from: owner }));
      });
    });
  });

  describe('approve', () => {
    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    describe('when the spender is not the zero address', () => {
      const spender = recipient;

      describe('when the sender has enough balance', () => {
        const amount = convert(100);

        it('emits an approval event', async () => {
          const { logs } = await token.approve(spender, amount, { from: owner });

          logs.length.should.equal(1);
          logs[0].event.should.equal('Approval');
          logs[0].args.owner.should.equal(owner);
          logs[0].args.spender.should.equal(spender);
          logs[0].args.value.should.be.bignumber.equal(amount);
        });

        describe('when there was no approved amount before', () => {
          it('approves the requested amount', async () => {
            await token.approve(spender, amount, { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(amount);
          });
        });

        describe('when the spender had an approved amount', () => {
          beforeEach(async () => {
            await token.approve(spender, convert(1), { from: owner });
          });

          it('approves the requested amount and replaces the previous one', async () => {
            await token.approve(spender, amount, { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(amount);
          });
        });
      });

      describe('when the sender does not have enough balance', () => {
        const amount = convert(101);

        it('emits an approval event', async () => {
          const { logs } = await token.approve(spender, amount, { from: owner });

          logs.length.should.equal(1);
          logs[0].event.should.equal('Approval');
          logs[0].args.owner.should.equal(owner);
          logs[0].args.spender.should.equal(spender);
          logs[0].args.value.should.be.bignumber.equal(amount);
        });

        describe('when there was no approved amount before', () => {
          it('approves the requested amount', async () => {
            await token.approve(spender, amount, { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(amount);
          });
        });

        describe('when the spender had an approved amount', () => {
          beforeEach(async () => {
            await token.approve(spender, convert(1), { from: owner });
          });

          it('approves the requested amount and replaces the previous one', async () => {
            await token.approve(spender, amount, { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(amount);
          });
        });
      });
    });

    describe('when the spender is the zero address', () => {
      const amount = convert(100);
      const spender = ZERO_ADDRESS;

      it('reverts', async () => {
        await assertRevert(token.approve(spender, amount, { from: owner }));
      });
    });
  });

  describe('transfer from', () => {
    const spender = recipient;

    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    describe('when the recipient is not the zero address', () => {
      const to = anotherAccount;

      describe('when the spender has enough approved balance', () => {
        beforeEach(async () => {
          const amount = convert(100);
          await token.approve(spender, amount, { from: owner });
        });

        describe('when the owner has enough balance', () => {
          const amount = convert(100);

          it('transfers the requested amount', async () => {
            await token.transferFrom(owner, to, amount, { from: spender });

            (await token.balanceOf(owner)).should.be.bignumber.equal(bn(0));

            (await token.balanceOf(to)).should.be.bignumber.equal(amount);
          });

          it('decreases the spender allowance', async () => {
            await token.transferFrom(owner, to, amount, { from: spender });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(bn(0));
          });

          it('emits a transfer event', async () => {
            const { logs } = await token.transferFrom(owner, to, amount, { from: spender });

            logs.length.should.equal(2);
            logs[0].event.should.equal('Transfer');
            logs[0].args.from.should.equal(owner);
            logs[0].args.to.should.equal(to);
            logs[0].args.value.should.be.bignumber.equal(amount);
            logs[1].event.should.equal('Approval');
            logs[1].args.owner.should.equal(owner);
            logs[1].args.spender.should.equal(spender);
            logs[1].args.value.should.be.bignumber.equal(bn(0));
          });
        });

        describe('when the owner does not have enough balance', () => {
          const amount = convert(101);

          it('reverts', async () => {
            await assertRevert(token.transferFrom(owner, to, amount, { from: spender }));
          });
        });
      });

      describe('when the spender does not have enough approved balance', () => {
        beforeEach(async () => {
          const amount = convert(99);
          await token.approve(spender, amount, { from: owner });
        });

        describe('when the owner has enough balance', () => {
          const amount = convert(100);

          it('reverts', async () => {
            await assertRevert(token.transferFrom(owner, to, amount, { from: spender }));
          });
        });

        describe('when the owner does not have enough balance', () => {
          const amount = convert(101);

          it('reverts', async () => {
            await assertRevert(token.transferFrom(owner, to, amount, { from: spender }));
          });
        });
      });
    });

    describe('when the recipient is the zero address', () => {
      const amount = convert(100);

      beforeEach(async () => {
        await token.approve(spender, amount, { from: owner });
      });
    });
  });

  describe('decrease allowance', () => {
    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    describe('when the spender is not the zero address', () => {
      const spender = recipient;

      const shouldDecreaseApproval = (amount) => {
        describe('when there was no approved amount before', () => {
          it('reverts', async () => {
            await assertRevert(token.decreaseAllowance(spender, amount, { from: owner }));
          });
        });

        describe('when the spender had an approved amount', () => {
          const approvedAmount = amount;

          beforeEach(async () => {
            ({ logs: this.logs } = await token.approve(spender, approvedAmount, { from: owner }));
          });

          it('emits an approval event', async () => {
            const { logs } = await token.decreaseAllowance(
              spender, approvedAmount, { from: owner });

            logs.length.should.equal(1);
            logs[0].event.should.equal('Approval');
            logs[0].args.owner.should.equal(owner);
            logs[0].args.spender.should.equal(spender);
            logs[0].args.value.should.be.bignumber.equal(bn(0));
          });

          it('decreases the spender allowance subtracting the requested amount', async () => {
            await token.decreaseAllowance(spender, (bn(approvedAmount)).sub(bn(1)),
              { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(bn(1));
          });

          it('sets the allowance to zero when all allowance is removed', async () => {
            await token.decreaseAllowance(spender, approvedAmount, { from: owner });
            (await token.allowance(owner, spender)).should.be.bignumber.equal(bn(0));
          });

          it('reverts when more than the full allowance is removed', async () => {
            await assertRevert(
              token.decreaseAllowance(spender, (bn(approvedAmount)).add(bn(1)), { from: owner }));
          });
        });
      };

      describe('when the sender has enough balance', () => {
        const amount = convert(100);

        shouldDecreaseApproval(amount);
      });

      describe('when the sender does not have enough balance', () => {
        const amount = convert(101);

        shouldDecreaseApproval(amount);
      });
    });

    describe('when the spender is the zero address', () => {
      const amount = convert(100);
      const spender = ZERO_ADDRESS;

      it('reverts', async () => {
        await assertRevert(token.decreaseAllowance(spender, amount, { from: owner }));
      });
    });
  });

  describe('increase allowance', () => {
    let amount = convert(100);

    beforeEach(async () => {
      const signup = await hub.signup(tokenName, { from: owner });
      token = await Token.at(signup.logs[0].args.token);
    });

    describe('when the spender is not the zero address', () => {
      const spender = recipient;

      describe('when the sender has enough balance', () => {
        it('emits an approval event', async () => {
          const { logs } = await token.increaseAllowance(spender, amount, { from: owner });

          logs.length.should.equal(1);
          logs[0].event.should.equal('Approval');
          logs[0].args.owner.should.equal(owner);
          logs[0].args.spender.should.equal(spender);
          logs[0].args.value.should.be.bignumber.equal(amount);
        });

        describe('when there was no approved amount before', () => {
          it('approves the requested amount', async () => {
            await token.increaseAllowance(spender, amount, { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(amount);
          });
        });

        describe('when the spender had an approved amount', () => {
          beforeEach(async () => {
            const approval = convert(1);
            await token.approve(spender, approval, { from: owner });
          });

          it('increases the spender allowance adding the requested amount', async () => {
            await token.increaseAllowance(spender, amount, { from: owner });

            (await token.allowance(owner, spender))
              .should.be.bignumber.equal(amount.add(convert(1)));
          });
        });
      });

      describe('when the sender does not have enough balance', () => {
        amount = convert(101);

        it('emits an approval event', async () => {
          const { logs } = await token.increaseAllowance(spender, amount, { from: owner });

          logs.length.should.equal(1);
          logs[0].event.should.equal('Approval');
          logs[0].args.owner.should.equal(owner);
          logs[0].args.spender.should.equal(spender);
          logs[0].args.value.should.be.bignumber.equal(amount);
        });

        describe('when there was no approved amount before', () => {
          it('approves the requested amount', async () => {
            await token.increaseAllowance(spender, amount, { from: owner });

            (await token.allowance(owner, spender)).should.be.bignumber.equal(amount);
          });
        });

        describe('when the spender had an approved amount', () => {
          beforeEach(async () => {
            const approval = convert(1);
            await token.approve(spender, approval, { from: owner });
          });

          it('increases the spender allowance adding the requested amount', async () => {
            await token.increaseAllowance(spender, amount, { from: owner });

            (await token.allowance(owner, spender))
              .should.be.bignumber.equal(amount.add(convert(1)));
          });
        });
      });
    });

    describe('when the spender is the zero address', () => {
      const spender = ZERO_ADDRESS;

      it('reverts', async () => {
        await assertRevert(token.increaseAllowance(spender, amount, { from: owner }));
      });
    });
  });
});
