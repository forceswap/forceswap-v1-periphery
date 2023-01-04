import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify, defaultAbiCoder, formatEther } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './shared/utilities'
import { v1Fixture } from './shared/fixtures'

import ExampleSwapToPrice from '../build/ExampleSwapToPrice.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('ExampleSwapToPrice', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let token0: Contract
  let token1: Contract
  let pair: Contract
  let swapToPriceExample: Contract
  let router: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v1Fixture)
    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    router = fixture.router
    swapToPriceExample = await deployContract(
      wallet,
      ExampleSwapToPrice,
      [fixture.factoryV1.address, fixture.router.address],
      overrides
    )
  })

  beforeEach('set up price differential of 1:100', async () => {
    await token0.transfer(pair.address, expandTo18Decimals(10))
    await token1.transfer(pair.address, expandTo18Decimals(1000))
    await pair.sync(overrides)
  })

  beforeEach('approve the swap contract to spend any amount of both tokens', async () => {
    await token0.approve(swapToPriceExample.address, MaxUint256)
    await token1.approve(swapToPriceExample.address, MaxUint256)
  })

  it('correct router address', async () => {
    expect(await swapToPriceExample.router()).to.eq(router.address)
  })

  describe('#swapToPrice', () => {
    it('requires non-zero true price inputs', async () => {
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          0,
          0,
          MaxUint256,
          MaxUint256,
          wallet.address,
          MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_PRICE')
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          10,
          0,
          MaxUint256,
          MaxUint256,
          wallet.address,
          MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_PRICE')
      await expect(
        swapToPriceExample.swapToPrice(
          token0.address,
          token1.address,
          0,
          10,
          MaxUint256,
          MaxUint256,
          wallet.address,
          MaxUint256
        )
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_PRICE')
    })

    it('requires non-zero max spend', async () => {
      await expect(
        swapToPriceExample.swapToPrice(token0.address, token1.address, 1, 100, 0, 0, wallet.address, MaxUint256)
      ).to.be.revertedWith('ExampleSwapToPrice: ZERO_SPEND')
    })
  })
})
