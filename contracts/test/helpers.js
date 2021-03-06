// Node modules
const keccak256 = require('js-sha3').keccak_256
const BN = require('bn.js')
const ethers = require('ethers')

// Local imports
const TokenRegistry = artifacts.require('TokenRegistry.sol')
const EthereumDIDRegistry = artifacts.require('EthereumDIDRegistry.sol')
const Token = artifacts.require('Dai.sol')
const utils = require('./utils.js')

////////////// CONSTANTS //////////////
const offChainDataName = 'TokenData'
// Setting validity to max uint256 value, since we don't plan to use validity
const maxValidity = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
// DAI_PERMIT_TYPEHASH = keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)");
const DAI_PERMIT_TYPEHASH = 'ea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb'

const helpers = {
    applySignedWithAttribute: async (newMemberWallet, ownerWallet) => {
        const ownerAddress = ownerWallet.signingKey.address
        const newMemberAddress = newMemberWallet.signingKey.address
        const tokenRegistry = await TokenRegistry.deployed()
        const token = await Token.deployed()

        // Get the signature for changing ownership on ERC-1056 Registry
        const applySignedSig = await module.exports.applySigned(newMemberWallet, ownerWallet)
        // Get the signature for permitting TokenRegistry to transfer DAI on users behalf
        const permitSig = await module.exports.daiPermit(ownerWallet, tokenRegistry.address)

        const setAttributeData =
            Buffer.from('setAttribute').toString('hex') +
            utils.stringToBytes32(offChainDataName) +
            utils.stripHexPrefix(utils.mockIPFSData) +
            maxValidity

        // Get the signature for setting the attribute (i.e. Token data) on ERC-1056
        const setAttributeSignedSig = await module.exports.setAttributeSigned(
            newMemberWallet,
            setAttributeData
        )

        const reserveBankAddress = await tokenRegistry.reserveBank()
        const reserveBankBalanceStart = await token.balanceOf(reserveBankAddress)
        const ownerBalanceStart = await token.balanceOf(ownerAddress)

        // Send all three meta transactions to TokenRegistry to be executed in one tx
        tx = await tokenRegistry.applySignedWithAttributeAndPermit(
            newMemberAddress,
            [setAttributeSignedSig.v, applySignedSig.v, permitSig.v],
            [setAttributeSignedSig.r, applySignedSig.r, permitSig.r],
            [setAttributeSignedSig.s, applySignedSig.s, permitSig.s],
            ownerAddress,
            '0x' + utils.stringToBytes32(offChainDataName),
            utils.mockIPFSData,
            '0x' + maxValidity,
            { from: ownerAddress }
        )

        // Tx logs order
        // 1. NewMember
        // 2. Owner changed
        // 3. Permit
        // 4. Transfer
        // 5. Set Attribute

        // Token Checks
        const ownerBalanceEnd = (await token.balanceOf(ownerAddress)).toString()
        const reserveBankBalanceEnd = await token.balanceOf(reserveBankAddress)
        const updatedAllowance = await token.allowance(ownerAddress, tokenRegistry.address)

        assert.equal(
            ownerBalanceEnd.toString(),
            ownerBalanceStart.sub(utils.applyFeeBN).toString(),
            'Owner did not transfer application fee'
        )
        assert.equal(
            reserveBankBalanceEnd.toString(),
            reserveBankBalanceStart.add(utils.applyFeeBN).toString(),
            'Bank didnt receive application fee'
        )
        assert.equal(
            updatedAllowance.toString(),
            '115792089237316195423570985008687907853269984665640564039457584007913129639935',
            'Allowance was not set to max from owner to TokenRegistry'
        )

        // ERC-1056 Checks
        // Check Ownership change
        const didReg = await EthereumDIDRegistry.deployed()
        const identityOwner = await didReg.identityOwner(newMemberAddress)
        assert.equal(ownerAddress, identityOwner, 'Ownership was not transferred')

        // Check set attribute worked
        const setAttributeLogData = tx.receipt.rawLogs[1].data
        const mockDataFromLogs = setAttributeLogData.slice(
            setAttributeLogData.length - 64,
            setAttributeLogData.length
        )
        const ipfsMockDataStripped = utils.stripHexPrefix(utils.mockIPFSData)
        assert.equal(mockDataFromLogs, ipfsMockDataStripped, 'Logs do not include ipfs hash')

        // TokenRegistry checks
        const membershipStartTime = Number(
            (await tokenRegistry.getMembershipStartTime(newMemberAddress)).toString()
        )
        assert(membershipStartTime > 0, 'Membership start time not updated')

        console.log(`Member ${newMemberAddress} successfully added`)
    },

    applySigned: async (newMemberWallet, ownerWallet) => {
        const memberAddress = newMemberWallet.signingKey.address
        const memberPrivateKey = Buffer.from(
            utils.stripHexPrefix(newMemberWallet.signingKey.privateKey),
            'hex'
        )
        const ownerAddress = ownerWallet.signingKey.address
        const sig = await module.exports.signDataDIDRegistry(
            memberAddress,
            memberPrivateKey,
            memberAddress,
            Buffer.from('changeOwner').toString('hex') + utils.stripHexPrefix(ownerAddress),
            'changeOwner'
        )
        return sig
    },

    // Used after the owner is in possession of the identity
    setAttribute: async (memberAddress, ownerWallet) => {
        const didReg = await EthereumDIDRegistry.deployed()
        const ownerAddress = ownerWallet.signingKey.address
        const tx = await didReg.setAttribute(
            memberAddress,
            '0x' + utils.stringToBytes32(offChainDataName),
            utils.mockIPFSData,
            '0x' + maxValidity,
            { from: ownerAddress }
        )
        const event = tx.logs[0]
        assert.equal(event.event, 'DIDAttributeChanged')
        assert.equal(event.args.identity, memberAddress)
        assert.equal(event.args.name, '0x' + utils.stringToBytes32(offChainDataName))
        assert.equal(event.args.value, utils.mockIPFSData)
    },

    // Must be used in applySignedWithAttribute() to make a single transaction
    // At the time, owner is  random key generated in browser
    setAttributeSigned: async (newMemberWallet, data) => {
        const memberAddress = newMemberWallet.signingKey.address
        const signerAddress = memberAddress
        const signerPrivateKey = Buffer.from(
            utils.stripHexPrefix(newMemberWallet.signingKey.privateKey),
            'hex'
        )
        const sig = await module.exports.signDataDIDRegistry(
            memberAddress,
            signerPrivateKey,
            signerAddress,
            data,
            'setAttribute'
        )
        return sig
    },

    signDataDIDRegistry: async (identity, signingKey, signingAddress, data, functionName) => {
        const didReg = await EthereumDIDRegistry.deployed()
        let nonce = await didReg.nonce(signingAddress)
        if (functionName == 'changeOwner') {
            nonce = 1 // TODO - Change this so it isn't just 1, should be nonce + 1
        }
        const paddedNonce = utils.leftPad(Buffer.from([nonce], 64).toString('hex'))
        let dataToSign

        if (functionName == 'changeOwner') {
            dataToSign =
                '1900' +
                utils.stripHexPrefix(didReg.address) +
                paddedNonce +
                utils.stripHexPrefix(identity) +
                data
        } else if (functionName == 'setAttribute') {
            dataToSign =
                '1900' +
                utils.stripHexPrefix(didReg.address) +
                paddedNonce +
                utils.stripHexPrefix(identity) +
                data
        }
        const hash = Buffer.from(keccak256.buffer(Buffer.from(dataToSign, 'hex')))

        // This is how to use ethers without prepending "x19Ethereum Signed ..."
        const rawSigner = new ethers.utils.SigningKey(signingKey)
        let splitSig = rawSigner.signDigest(hash)

        return {
            r: splitSig.r,
            s: splitSig.s,
            v: splitSig.v
        }
    },

    // TODO - refactor all of the DAI helpers to be like the ones in mutations

    createDaiDomainSeparator: async () => {
        const domain = keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        )
        const daiName = 'Dai Stablecoin'
        const daiVersion = '1'
        const hashedName = keccak256(daiName)
        const hashedVersion = keccak256(daiVersion)

        // ChainID of uint256 9545 used for development, in bytes32
        const paddedChainID = '0000000000000000000000000000000000000000000000000000000000002549'
        const daiAddress = (await Token.deployed()).address
        const paddedDaiAddress = utils.leftPad(utils.stripHexPrefix(daiAddress))
        const data = domain + hashedName + hashedVersion + paddedChainID + paddedDaiAddress
        const hash = Buffer.from(keccak256.buffer(Buffer.from(data, 'hex')))
        return hash
    },

    signPermit: async (holderAddress, spenderAddress, holderPrivateKey, nonce) => {
        const paddedNonce = utils.leftPad(Buffer.from([nonce], 64).toString('hex'))
        // We set expiry to 0 always, as that will be default for the TokenRegistry calling
        const paddedExpiry = utils.leftPad(Buffer.from([0], 64).toString('hex'))
        // We set to 1 == true, as that will be default for the TokenRegistry calling
        const paddedTrue = utils.leftPad(Buffer.from([1], 64).toString('hex'))

        /*  Expected DAI_DOMAIN_SEPARATOR value on first test deploy (dependant on mock dai addr):
            Where mock dai addr = 0xCfEB869F69431e42cdB54A4F4f105C19C080A601 :
            0xcf69a4130104a154c155546e3966369c03a442bdff846f0bc1aae6f9e9a3b68f
        */
        const DAI_DOMAIN_SEPARATOR = await module.exports.createDaiDomainSeparator()

        /*  Expected structEncoded value on first test run (dependant on mock dai address)
            Where mock dai addr = 0xCfEB869F69431e42cdB54A4F4f105C19C080A601
            (note all are concatenated, spaces are for readability)
            Note we do not have 0x at the front of the byte string: 

            ea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb
            000000000000000000000000ffcf8fdee72ac11b5c542428b35eef5769c409f
            000000000000000000000000290fb167208af455bb137780163b7b7a9a10c16
            0000000000000000000000000000000000000000000000000000000000000000
            0000000000000000000000000000000000000000000000000000000000000000
            0000000000000000000000000000000000000000000000000000000000000001 
        */
        const structEncoded =
            DAI_PERMIT_TYPEHASH +
            // abi.encode in solidity automatically removes the checksum, so we must use toLowerCase
            utils.leftPad(utils.stripHexPrefix(holderAddress.toLowerCase())) +
            utils.leftPad(utils.stripHexPrefix(spenderAddress.toLowerCase())) +
            paddedNonce +
            paddedExpiry +
            paddedTrue

        /*  Expected hashedStruct value:
            01b930e8948f5be49f019425c83bcf1657b07efb06fb959192051e9c412abace
        */
        const hashedStruct = Buffer.from(keccak256.buffer(Buffer.from(structEncoded, 'hex')))
        const stringHashedStruct = hashedStruct.toString('hex')
        const stringDomainSeparator = DAI_DOMAIN_SEPARATOR.toString('hex')

        /*  Expected digestData value on first test run (dependant on mock dai address)
            Where mock dai addr = 0xCfEB869F69431e42cdB54A4F4f105C19C080A601
            (note all are concatenated, spaces are for readability)
            Note we do not have 0x at the front of the byte string: 

            1901
            cf69a4130104a154c155546e3966369c03a442bdff846f0bc1aae6f9e9a3b68f
            01b930e8948f5be49f019425c83bcf1657b07efb06fb959192051e9c412abace
        */
        const digestData = '1901' + stringDomainSeparator + stringHashedStruct

        /*  Expected digest value and first test deploy on ganache:
            fc60391b0087e420dc8e15ae01ef93d0814572bbd80b3111248897d3a0d9f941
        */
        const digest = Buffer.from(keccak256.buffer(Buffer.from(digestData, 'hex')))

        const rawSigner = new ethers.utils.SigningKey(holderPrivateKey)
        let splitSig = rawSigner.signDigest(digest)

        return {
            r: splitSig.r,
            s: splitSig.s,
            v: splitSig.v
        }
    },

    // Where holder == owner and spender == TokenRegistry
    daiPermit: async (holderWallet, spenderAddress) => {
        const token = await Token.deployed()
        const holderAddress = holderWallet.signingKey.address
        const nonce = (await token.nonces(holderAddress)).toString()
        const holderPrivateKey = Buffer.from(
            utils.stripHexPrefix(holderWallet.signingKey.privateKey),
            'hex'
        )
        const sig = await module.exports.signPermit(
            holderAddress,
            spenderAddress,
            holderPrivateKey,
            nonce
        )
        return sig
    },

    challenge: async (challenger, challengee, details, challengerOwner) => {
        const tokenRegistry = await TokenRegistry.deployed()
        const token = await Token.deployed()
        const reserveBankAddress = await tokenRegistry.reserveBank()
        const reserveBankBalanceStart = await token.balanceOf(reserveBankAddress)
        const challengerBalanceStart = await token.balanceOf(challengerOwner)

        // Check member exists
        assert(await tokenRegistry.isMember(challengee), 'Member was not added')

        const tx = await tokenRegistry.challenge(challenger, challengee, details, {
            from: challengerOwner
        })

        // Check balances
        const reserveBankBalanceAfterChallenge = await token.balanceOf(reserveBankAddress)
        const challengerBalanceAfterChallenge = await token.balanceOf(challengerOwner)
        assert.equal(
            reserveBankBalanceStart.add(utils.challengeDepositBN).toString(),
            reserveBankBalanceAfterChallenge.toString(),
            'Reserve bank did not receive challenge deposit'
        )
        assert.equal(
            challengerBalanceStart.sub(utils.challengeDepositBN).toString(),
            challengerBalanceAfterChallenge.toString(),
            'Challenger did not send the deposit'
        )

        // Get challengeID
        const challengeID = tx.logs[0].args.challengeID.toString()
        assert(await tokenRegistry.memberChallengeExists(challengee), 'Challenge was not created')
        return challengeID
    },

    resolveChallenge: async (challengeID, challengerOwner, challengeeOwner) => {
        const tokenRegistry = await TokenRegistry.deployed()
        const token = await Token.deployed()
        const reserveBankAddress = await tokenRegistry.reserveBank()
        const reserveBankBalanceAfterChallenge = await token.balanceOf(reserveBankAddress)
        const challengerBalanceAfterChallenge = await token.balanceOf(challengerOwner)
        const challengeeBalanceAfterChallenge = await token.balanceOf(challengeeOwner)

        // Increase time so challenge can be resolved
        await utils.increaseTime(utils.votePeriod + 1)
        assert(
            await tokenRegistry.challengeCanBeResolved(challengeID),
            'Challenge could not be resolved'
        )
        const result = await tokenRegistry.resolveChallenge(challengeID, { from: challengerOwner })
        const challengeResult = result.logs[1].event

        // Check balances
        const reserveBankBalanceAfterResolve = await token.balanceOf(reserveBankAddress)

        if (challengeResult === 'ChallengeSucceeded') {
            const challengerBalanceAfterResolve = await token.balanceOf(challengerOwner)
            assert.equal(
                reserveBankBalanceAfterChallenge
                    .sub(utils.challengeDepositBN.add(utils.applyFeeBN))
                    .toString(),
                reserveBankBalanceAfterResolve.toString(),
                'Reserve bank did not send out challenge deposit and application fee'
            )
            assert.equal(
                challengerBalanceAfterChallenge
                    .add(utils.challengeDepositBN.add(utils.applyFeeBN))
                    .toString(),
                challengerBalanceAfterResolve.toString(),
                'Challenger did not get their deposit and challengees application fee'
            )
        } else if (challengeResult === 'ChallengeFailed') {
            const challengeeBalanceAfterResolve = await token.balanceOf(challengeeOwner)
            assert.equal(
                reserveBankBalanceAfterChallenge.sub(utils.challengeDepositBN).toString(),
                reserveBankBalanceAfterResolve.toString(),
                'Reserve bank did not send out challenge deposit and application fee'
            )
            assert.equal(
                challengeeBalanceAfterChallenge.add(utils.challengeDepositBN).toString(),
                challengeeBalanceAfterResolve.toString(),
                'Challenger did not get their deposit and challengees application fee'
            )
        }
    }
}

module.exports = helpers
