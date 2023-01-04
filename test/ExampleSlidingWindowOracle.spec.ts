import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'

import { expandTo18Decimals, mineBlock, encodePrice } from './shared/utilities'
import { v1Fixture } from './shared/fixtures'

import ExampleSlidingWindowOracle from '../build/ExampleSlidingWindowOracle.json'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

const defaultToken0Amount = expandTo18Decimals(5)
const defaultToken1Amount = expandTo18Decimals(10)

describe('ExampleSlidingWindowOracle', () => {
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
  let weth: Contract
  let factory: Contract

  async function addLiquidity(amount0: BigNumber = defaultToken0Amount, amount1: BigNumber = defaultToken1Amount) {
    if (!amount0.isZero()) await token0.transfer(pair.address, amount0)
    if (!amount1.isZero()) await token1.transfer(pair.address, amount1)
    await pair.sync()
  }

  const defaultWindowSize = 86400 // 24 hours
  const defaultGranularity = 24 // 1 hour each

  function observationIndexOf(
    timestamp: number,
    windowSize: number = defaultWindowSize,
    granularity: number = defaultGranularity
  ): number {
    const periodSize = Math.floor(windowSize / granularity)
    const epochPeriod = Math.floor(timestamp / periodSize)
    return epochPeriod % granularity
  }

  function deployOracle(windowSize: number, granularity: number) {
    return deployContract(wallet, ExampleSlidingWindowOracle, [factory.address, windowSize, granularity], overrides)
  }

  beforeEach('deploy fixture', async function() {
    const fixture = await loadFixture(v1Fixture)

    token0 = fixture.token0
    token1 = fixture.token1
    pair = fixture.pair
    weth = fixture.WETH
    factory = fixture.factoryV1
  })

  // 1/1/2020 @ 12:00 am UTC
  // cannot be 0 because that instructs ganache to set it to current timestamp
  // cannot be 86400 because then timestamp 0 is a valid historical observation
  const startTime = 1577836800

  // must come before adding liquidity to pairs for correct cumulative price computations
  // cannot use 0 because that resets to current timestamp
  beforeEach(`set start time to ${startTime}`, () => mineBlock(provider, startTime))

  it('requires granularity to be greater than 0', async () => {
    await expect(deployOracle(defaultWindowSize, 0)).to.be.revertedWith('SlidingWindowOracle: GRANULARITY')
  })

  it('requires windowSize to be evenly divisible by granularity', async () => {
    await expect(deployOracle(defaultWindowSize - 1, defaultGranularity)).to.be.revertedWith(
      'SlidingWindowOracle: WINDOW_NOT_EVENLY_DIVISIBLE'
    )
  })

  it('computes the periodSize correctly', async () => {
    const oracle = await deployOracle(defaultWindowSize, defaultGranularity)
    expect(await oracle.periodSize()).to.eq(3600)
    const oracleOther = await deployOracle(defaultWindowSize * 2, defaultGranularity / 2)
    expect(await oracleOther.periodSize()).to.eq(3600 * 4)
  })

  describe('#observationIndexOf', () => {
    it('works for examples', async () => {
      const oracle = await deployOracle(defaultWindowSize, defaultGranularity)
      expect(await oracle.observationIndexOf(0)).to.eq(0)
      expect(await oracle.observationIndexOf(3599)).to.eq(0)
      expect(await oracle.observationIndexOf(3600)).to.eq(1)
      expect(await oracle.observationIndexOf(4800)).to.eq(1)
      expect(await oracle.observationIndexOf(7199)).to.eq(1)
      expect(await oracle.observationIndexOf(7200)).to.eq(2)
      expect(await oracle.observationIndexOf(86399)).to.eq(23)
      expect(await oracle.observationIndexOf(86400)).to.eq(0)
      expect(await oracle.observationIndexOf(90000)).to.eq(1)
    })
    it('overflow safe', async () => {
      const oracle = await deployOracle(25500, 255) // 100 period size
      expect(await oracle.observationIndexOf(0)).to.eq(0)
      expect(await oracle.observationIndexOf(99)).to.eq(0)
      expect(await oracle.observationIndexOf(100)).to.eq(1)
      expect(await oracle.observationIndexOf(199)).to.eq(1)
      expect(await oracle.observationIndexOf(25499)).to.eq(254) // 255th element
      expect(await oracle.observationIndexOf(25500)).to.eq(0)
    })
    it('matches offline computation', async () => {
      const oracle = await deployOracle(defaultWindowSize, defaultGranularity)
      for (let timestamp of [0, 5000, 1000, 25000, 86399, 86400, 86401]) {
        expect(await oracle.observationIndexOf(timestamp)).to.eq(observationIndexOf(timestamp))
      }
    })
  })
})
