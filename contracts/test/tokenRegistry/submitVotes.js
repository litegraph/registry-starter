const TokenRegistry = artifacts.require('TokenRegistry.sol')
const helpers = require('../helpers.js')
const utils = require('../utils.js')

contract('tokenRegistry', () => {
    const member1Wallet = utils.wallets.nine() // throw away wallet
    const member1Address = member1Wallet.signingKey.address
    const owner1Wallet = utils.wallets.zero()
    const owner1Address = owner1Wallet.signingKey.address

    const member2Wallet = utils.wallets.eight() // throw away wallet
    const member2Address = member2Wallet.signingKey.address
    const owner2Wallet = utils.wallets.one()
    const owner2Address = owner2Wallet.signingKey.address

    const member3Wallet = utils.wallets.seven() // throw away wallet
    const member3Address = member3Wallet.signingKey.address
    const owner3Wallet = utils.wallets.two()
    const owner3Address = owner3Wallet.signingKey.address

    const member4Wallet = utils.wallets.six() // throw away wallet
    const member4Address = member4Wallet.signingKey.address
    const owner4Wallet = utils.wallets.three()
    const owner4Address = owner4Wallet.signingKey.address

    const member5Wallet = utils.wallets.five() // throw away wallet
    const member5Address = member5Wallet.signingKey.address
    const owner5Wallet = utils.wallets.four()
    const owner5Address = owner5Wallet.signingKey.address

    const nonMemberWallet = utils.wallets.ten()
    const nonMemberAddress = nonMemberWallet.signingKey.address

    const voteChoice = {
        Null: 0,
        Yes: 1,
        No: 2
    }
    const fakeDetails = '0x5555555555555555555555555555555555555555555555555555555555554444'

    describe('Test voting require statements and functionality', () => {
        // Set up 5 Tokens
        before(async () => {
            // Note one address owns 4 of these tokens
            await helpers.applySignedWithAttribute(member1Wallet, owner1Wallet)
            await helpers.applySignedWithAttribute(member2Wallet, owner1Wallet)
            await helpers.applySignedWithAttribute(member3Wallet, owner1Wallet)
            await helpers.applySignedWithAttribute(member4Wallet, owner4Wallet)
            await helpers.applySignedWithAttribute(member5Wallet, owner5Wallet)
        })
        it('submitVotes() works. and tests passing unequal arrays will fail', async () => {
            const tokenRegistry = await TokenRegistry.deployed()

            // Member 4 challenges Member 5
            // We will then get owner1, who owns three token members, to vote 3 times
            const challengeID = await helpers.challenge(
                member4Address,
                member5Address,
                fakeDetails,
                owner4Address
            )

            // First we ensure arrays must be equal lengths
            await utils.expectRevert(
                tokenRegistry.submitVotes(
                    challengeID,
                    [voteChoice.Yes, voteChoice.Yes, voteChoice.Yes, voteChoice.Yes],
                    [member1Address, member2Address, member3Address]
                ),
                `submitVotes - Arrays must be equal`
            )
            await utils.expectRevert(
                tokenRegistry.submitVotes(
                    challengeID,
                    [voteChoice.Yes, voteChoice.Yes, voteChoice.Yes],
                    [member1Address, member2Address, member3Address, member4Address]
                ),
                `submitVotes - Arrays must be equal`
            )

            // Then we test real votes
            const result = await tokenRegistry.submitVotes(
                challengeID,
                [voteChoice.Yes, voteChoice.Yes, voteChoice.Yes],
                [member1Address, member2Address, member3Address]
            )

            // Then we look at the logs to confirm success
            for (let i = 0; i < result.logs.length; i++) {
                assert.equal(result.logs[i].event, 'SubmitVote', 'SubmitVote not emitted 3 times')
                assert.equal(
                    result.logs[i].args.voteChoice.toString(),
                    voteChoice.Yes,
                    'Vote choice not recorded correctly'
                )
            }
        })
    })
})
