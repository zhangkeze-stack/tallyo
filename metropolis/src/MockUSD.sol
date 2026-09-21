// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    // 测试网专用：任何人都能给自己领测试美元
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
