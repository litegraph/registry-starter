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
            await helpers.applySignedWithAttribute(member1Wallet, owner1Wallet)
            await helpers.applySignedWithAttribute(member2Wallet, owner2Wallet)
            await helpers.applySignedWithAttribute(member3Wallet, owner3Wallet)
            await helpers.applySignedWithAttribute(member4Wallet, owner4Wallet)
            await helpers.applySignedWithAttribute(member5Wallet, owner5Wallet)
        })
        it('Voting on a challenge that does not exist fails', async () => {
            const tokenRegistry = await TokenRegistry.deployed()
            const fakeChallengeID = 500
            await utils.expectRevert(
                tokenRegistry.submitVote(fakeChallengeID, voteChoice.Yes, member1Address, {
                    from: owner1Address
                }),
                `submitVote - Challenge does not exist`
            )
        })
        it('Voting must be yes or no, any other choice fails', async () => {
            const tokenRegistry = await TokenRegistry.deployed()
            const challengeID = await helpers.challenge(
                member1Address,
                member5Address,
                fakeDetails,
                owner1Address
            )

            await utils.expectRevert(
                tokenRegistry.submitVote(challengeID, 0, member1Address, {
                    from: owner1Address
                }),
                `submitVote - Vote must be either Yes or No`
            )

            // For access outside of an enum, the error is invalid opcode
            await utils.expectRevert(
                tokenRegistry.submitVote(challengeID, 3, member1Address, {
                    from: owner1Address
                }),
                `invalid opcode`
            )
        })

        it('Double voting on a challenge fails', async () => {
            const tokenRegistry = await TokenRegistry.deployed()
            const challengeID = await tokenRegistry.getChallengeID(member5Address)

            await tokenRegistry.submitVote(challengeID, 1, member2Address, {
                from: owner2Address
            })
            await utils.expectRevert(
                tokenRegistry.submitVote(challengeID, 1, member2Address, {
                    from: owner2Address
                }),
                `submitVote - Member has already voted on this challenge`
            )
        })

        it('Voting by a non-member fails', async () => {
            const tokenRegistry = await TokenRegistry.deployed()
            const challengeID = await tokenRegistry.getChallengeID(member5Address)
            await utils.expectRevert(
                tokenRegistry.submitVote(challengeID, 1, nonMemberAddress, {
                    from: nonMemberAddress
                }),
                `onlyMemberOwner - Address is not a member`
            )
        })
        it('Voting on an expired challenge fails', async () => {
            const tokenRegistry = await TokenRegistry.deployed()
            const challengeID = await tokenRegistry.getChallengeID(member5Address)

            // Increase time, but do not resolve challenge yet
            await utils.increaseTime(utils.votePeriod + 1)
            await utils.expectRevert(
                tokenRegistry.submitVote(challengeID, 1, member3Address, {
                    from: owner3Address
                }),
                `submitVote - Challenge voting period has expired`
            )
        })
    })
})
