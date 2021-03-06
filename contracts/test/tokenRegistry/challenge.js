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

    describe(
        'Challenges. Functions: challenge(), submitVote(), submitVotes() resolveChallenge(), ' +
            'memberChallengeExists(), challengeCanBeResolved(), isMember()',
        () => {
            // Set up 5 Tokens
            before(async () => {
                await helpers.applySignedWithAttribute(member1Wallet, owner1Wallet)
                await helpers.applySignedWithAttribute(member2Wallet, owner2Wallet)
                await helpers.applySignedWithAttribute(member3Wallet, owner3Wallet)
                await helpers.applySignedWithAttribute(member4Wallet, owner4Wallet)
                await helpers.applySignedWithAttribute(member5Wallet, owner5Wallet)
            })

            it('should allow a member to be challenged, lose, and be removed, and then reapply successfully. Also tests chalengee cannot vote on their own challenge', async () => {
                const tokenRegistry = await TokenRegistry.deployed()

                const challengeID = await helpers.challenge(
                    member1Address,
                    member5Address,
                    fakeDetails,
                    owner1Address
                )

                await tokenRegistry.submitVote(challengeID, voteChoice.Yes, member2Address, {
                    from: owner2Address
                })
                await tokenRegistry.submitVote(challengeID, voteChoice.Yes, member3Address, {
                    from: owner3Address
                })

                // Expect that challengee can't vote on their own challenge
                await utils.expectRevert(
                    tokenRegistry.submitVote(challengeID, voteChoice.Yes, member5Address, {
                        from: owner5Address
                    }),
                    `submitVote - Member can't vote on their own challenge`
                )

                await helpers.resolveChallenge(challengeID, owner1Address, owner5Address)

                // Check member has been removed
                assert(!(await tokenRegistry.isMember(member5Address)), 'Member was not removed')

                // Check challenge was removed
                assert(
                    !(await tokenRegistry.memberChallengeExists(member5Address)),
                    'Challenge was removed as expected'
                )
            })

            it('should allow a member to be challenged, win, and stay', async () => {
                const tokenRegistry = await TokenRegistry.deployed()
                // Check member exists
                assert(await tokenRegistry.isMember(member4Address), 'Member was not added')

                const challengeID = await helpers.challenge(
                    member1Address,
                    member4Address,
                    fakeDetails,
                    owner1Address
                )

                await tokenRegistry.submitVote(challengeID, voteChoice.No, member2Address, {
                    from: owner2Address
                })
                await tokenRegistry.submitVote(challengeID, voteChoice.No, member3Address, {
                    from: owner3Address
                })

                await helpers.resolveChallenge(challengeID, owner1Address, owner4Address)

                // Check member still exists
                assert(
                    await tokenRegistry.isMember(member4Address),
                    'Member was removed, when they shouldnt have been'
                )

                // Check challenge was removed
                assert(
                    !(await tokenRegistry.memberChallengeExists(member4Address)),
                    'Challenge was removed as expected'
                )
            })

            it('challenge should fail when no one votes except the challenger', async () => {
                const tokenRegistry = await TokenRegistry.deployed()
                // Check member exists
                assert(await tokenRegistry.isMember(member4Address), 'Member was not added')

                const challengeID = await helpers.challenge(
                    member1Address,
                    member4Address,
                    fakeDetails,
                    owner1Address
                )

                await helpers.resolveChallenge(challengeID, owner1Address, owner4Address)

                // Check member still exists, since only one vote happened
                assert(
                    await tokenRegistry.isMember(member4Address),
                    'Member was removed, when they shouldnt have been'
                )

                // Check challenge was removed
                assert(
                    !(await tokenRegistry.memberChallengeExists(member4Address)),
                    'Challenge was removed as expected'
                )
            })
            it('challenger cant challenge self. challenger must exist. challengee must exist', async () => {
                const tokenRegistry = await TokenRegistry.deployed()
                // Check member exists
                assert(await tokenRegistry.isMember(member4Address), 'Member was not added')

                // Expect fail for trying to challenge self
                await utils.expectRevert(
                    tokenRegistry.challenge(member3Address, member3Address, fakeDetails, {
                        from: owner3Address
                    }),
                    "challenge - Can't challenge self"
                )

                // Expect fail for challenger not existing
                await utils.expectRevert(
                    tokenRegistry.challenge(nonMemberAddress, member3Address, fakeDetails, {
                        from: nonMemberAddress
                    }),
                    'onlyMemberOwner - Address is not a member'
                )

                // Expect fail for trying to challenge self
                await utils.expectRevert(
                    tokenRegistry.challenge(member3Address, nonMemberAddress, fakeDetails, {
                        from: owner3Address
                    }),
                    'challenge - Challengee must exist'
                )
            })
            it('challengee cannot have two challenges against them. and challengee cannot exit during ongoing challenge', async () => {
                const tokenRegistry = await TokenRegistry.deployed()
                // Check member exists
                assert(await tokenRegistry.isMember(member4Address), 'Member was not added')

                await helpers.challenge(member1Address, member4Address, fakeDetails, owner1Address)

                // Expect that challengee can't have two challenges against them
                await utils.expectRevert(
                    tokenRegistry.challenge(member1Address, member4Address, fakeDetails, {
                        from: owner1Address
                    }),
                    `challengeCanBeResolved - Current challenge is not ready to be resolved`
                )

                // Expect member can't exit when challenged
                await utils.expectRevert(
                    tokenRegistry.memberExit(member4Address, { from: owner4Address }),
                    "memberExit - Can't exit during ongoing challenge"
                )
            })
        }
    )
})
