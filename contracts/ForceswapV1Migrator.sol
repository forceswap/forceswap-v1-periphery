pragma solidity =0.6.6;

import '@forceswap/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IforceswapV1Migrator.sol';
import './interfaces/V/IforceswapVFactory.sol';
import './interfaces/V/IforceswapVExchange.sol';
import './interfaces/IforceswapV1Router01.sol';
import './interfaces/IERC20.sol';

contract forceswapV1Migrator is IforceswapV1Migrator {
    IforceswapVFactory immutable factoryV;
    IforceswapV1Router01 immutable router;

    constructor(address _factoryV, address _router) public {
        factoryV = IforceswapVFactory(_factoryV);
        router = IforceswapV1Router01(_router);
    }

    // needs to accept ETH from any v exchange and the router. ideally this could be enforced, as in the router,
    // but it's not possible because it requires a call to the v factory, which takes too much gas
    receive() external payable {}

    function migrate(address token, uint amountTokenMin, uint amountETHMin, address to, uint deadline)
        external
        override
    {
        IforceswapVExchange exchangeV = IforceswapVExchange(factoryV.getExchange(token));
        uint liquidityV = exchangeV.balanceOf(msg.sender);
        require(exchangeV.transferFrom(msg.sender, address(this), liquidityV), 'TRANSFER_FROM_FAILED');
        (uint amountETHV, uint amountTokenV) = exchangeV.removeLiquidity(liquidityV, 1, 1, uint(-1));
        TransferHelper.safeApprove(token, address(router), amountTokenV);
        (uint amountTokenV1, uint amountETHV1,) = router.addLiquidityETH{value: amountETHV}(
            token,
            amountTokenV,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );
        if (amountTokenV > amountTokenV1) {
            TransferHelper.safeApprove(token, address(router), 0); // be a good blockchain citizen, reset allowance to 0
            TransferHelper.safeTransfer(token, msg.sender, amountTokenV - amountTokenV1);
        } else if (amountETHV > amountETHV1) {
            // addLiquidityETH guarantees that all of amountETHV or amountTokenV will be used, hence this else is safe
            TransferHelper.safeTransferETH(msg.sender, amountETHV - amountETHV1);
        }
    }
}
