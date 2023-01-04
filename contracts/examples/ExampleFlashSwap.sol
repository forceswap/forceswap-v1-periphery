pragma solidity =0.6.6;

import '@forceswap/v1-core/contracts/interfaces/IforceswapV1Callee.sol';

import '../libraries/forceswapV1Library.sol';
import '../interfaces/V/IforceswapVFactory.sol';
import '../interfaces/V/IforceswapVExchange.sol';
import '../interfaces/IforceswapV1Router01.sol';
import '../interfaces/IERC20.sol';
import '../interfaces/IWETH.sol';

contract ExampleFlashSwap is IforceswapV1Callee {
    IforceswapVFactory immutable factoryV;
    address immutable factory;
    IWETH immutable WETH;

    constructor(address _factory, address _factoryV, address router) public {
        factoryV = IforceswapVFactory(_factoryV);
        factory = _factory;
        WETH = IWETH(IforceswapV1Router01(router).WETH());
    }

    // needs to accept ETH from any V exchange and WETH. ideally this could be enforced, as in the router,
    // but it's not possible because it requires a call to the v factory, which takes too much gas
    receive() external payable {}

    // gets tokens/WETH via a V1 flash swap, swaps for the ETH/tokens on V, repays V1, and keeps the rest!
    function forceswapV1Call(address sender, uint amount0, uint amount1, bytes calldata data) external override {
        address[] memory path = new address[](2);
        uint amountToken;
        uint amountETH;
        { // scope for token{0,1}, avoids stack too deep errors
        address token0 = IforceswapV1Pair(msg.sender).token0();
        address token1 = IforceswapV1Pair(msg.sender).token1();
        assert(msg.sender == forceswapV1Library.pairFor(factory, token0, token1)); // ensure that msg.sender is actually a V1 pair
        assert(amount0 == 0 || amount1 == 0); // this strategy is unidirectional
        path[0] = amount0 == 0 ? token0 : token1;
        path[1] = amount0 == 0 ? token1 : token0;
        amountToken = token0 == address(WETH) ? amount1 : amount0;
        amountETH = token0 == address(WETH) ? amount0 : amount1;
        }

        assert(path[0] == address(WETH) || path[1] == address(WETH)); // this strategy only works with a V1 WETH pair
        IERC20 token = IERC20(path[0] == address(WETH) ? path[1] : path[0]);
        IforceswapVExchange exchangeV = IforceswapVExchange(factoryV.getExchange(address(token))); // get V exchange

        if (amountToken > 0) {
            (uint minETH) = abi.decode(data, (uint)); // slippage parameter for V, passed in by caller
            token.approve(address(exchangeV), amountToken);
            uint amountReceived = exchangeV.tokenToEthSwapInput(amountToken, minETH, uint(-1));
            uint amountRequired = forceswapV1Library.getAmountsIn(factory, amountToken, path)[0];
            assert(amountReceived > amountRequired); // fail if we didn't get enough ETH back to repay our flash loan
            WETH.deposit{value: amountRequired}();
            assert(WETH.transfer(msg.sender, amountRequired)); // return WETH to V1 pair
            (bool success,) = sender.call{value: amountReceived - amountRequired}(new bytes(0)); // keep the rest! (ETH)
            assert(success);
        } else {
            (uint minTokens) = abi.decode(data, (uint)); // slippage parameter for V, passed in by caller
            WETH.withdraw(amountETH);
            uint amountReceived = exchangeV.ethToTokenSwapInput{value: amountETH}(minTokens, uint(-1));
            uint amountRequired = forceswapV1Library.getAmountsIn(factory, amountETH, path)[0];
            assert(amountReceived > amountRequired); // fail if we didn't get enough tokens back to repay our flash loan
            assert(token.transfer(msg.sender, amountRequired)); // return tokens to V1 pair
            assert(token.transfer(sender, amountReceived - amountRequired)); // keep the rest! (tokens)
        }
    }
}
