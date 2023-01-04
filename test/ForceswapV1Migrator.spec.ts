import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, MaxUint256 } from 'ethers/constants'
import { bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { v1Fixture } from './shared/fixtures'
import { expandTo18Decimals, MINIMUM_LIQUIDITY } from './shared/utilities'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('forceswapV1Migrator', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let WETHPartner: Contract
  let WETHPair: Contract
  let router: Contract
  let migrator: Contract
  let WETHExchangeV: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v1Fixture)
    WETHPartner = fixture.WETHPartner
    WETHPair = fixture.WETHPair
    router = fixture.router01 // we used router01 for this contract
    migrator = fixture.migrator
    WETHExchangeV = fixture.WETHExchangeV
  })
})
