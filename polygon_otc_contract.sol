// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

contract otcLedger {

    address public owner;
    mapping (address => uint64[]) inDeal;
    uint64 public last_deal_id;
    uint64[] internal ongoingDeals;

    uint64 internal fullMassaAmount;
    uint64 internal fullUsdtAmount;

    // uint constant public TIME_LIMIT = 1 hours;

    enum Status { Absent, Pending, Canceled, Success }

    /* new deal struct */
    struct Deal {
        uint64 deal_id;
        address buyer;
        string massaBuyer;
        address seller;
        string massaSeller;
        uint64 amount;
        uint64 fee;
        uint64 massaAmount;
        uint64 rate;
        uint time_limit;
        Status status;
    }

    mapping (uint64 => Deal) deals;

    event NewDeal(uint64 id, address buyer, address seller);
    event DealSuccess(uint64 id, address indexed buyer, address indexed seller);
    event DealCanceled(uint64 id, address indexed buyer, address indexed seller);

    IERC20 public usdt;

    constructor() {
        owner = msg.sender;
        usdt = IERC20(0x87ca1b49B2613E8067D11d963fA01fA1dD39Cb618); // USDT ADDRESS !!!!
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not an owner!");
        _;
    }

    /* 
    * new deal creation */
    function newDeal(
            uint64 _deal_id,
            address _buyer,
            string memory _massaBuyer,
            address _seller,
            string memory _massaSeller,
            uint64 _amount,
            uint64 _fee,
            uint64 _massaAmount,
            uint64 _rate,
            uint64 _timestamp
            ) public onlyOwner returns (bool) {
                
        require(deals[_deal_id].buyer == address(0), "deal_id is already exist");
        require(_buyer != _seller, "Buyer and Seller must be different!");
        require(getUSDTBalance(_buyer) >= _amount + _fee, "Buyer don't have enought USDT");
        require(_timestamp > (block.timestamp + 30 minutes) * 1000, "to late to start deal");
        
        deals[_deal_id] = Deal(_deal_id, _buyer, _massaBuyer, _seller, _massaSeller, _amount, _fee, _massaAmount, _rate, _timestamp, Status.Pending);

        ongoingDeals.push(_deal_id);
        inDeal[_buyer].push(_deal_id);

        last_deal_id = _deal_id;

        emit NewDeal(_deal_id, deals[_deal_id].buyer, deals[_deal_id].seller);
        
        return true;
    }

    /* Massa Buyer part of the deal */
    function buyMassa(uint64 _deal_id) public payable returns (bool) {
        require(deals[_deal_id].buyer == msg.sender, "not your deal");
        require(deals[_deal_id].time_limit > block.timestamp * 1000, "time is over");
        require(deals[_deal_id].status != Status.Canceled, "deal was canceled");
        require(deals[_deal_id].status != Status.Success, "deal was successfully ended");
        
        usdt.safeTransferFrom(msg.sender, deals[_deal_id].seller, deals[_deal_id].amount);
        usdt.safeTransferFrom(msg.sender, owner, deals[_deal_id].fee);

        deals[_deal_id].status = Status.Success;

        _remove(_deal_id);

        fullMassaAmount += deals[_deal_id].massaAmount;
        fullUsdtAmount += deals[_deal_id].amount;

        emit DealSuccess(_deal_id, deals[_deal_id].buyer, deals[_deal_id].seller);

        return true;
    }

    /* deal cancellation */
    function cancelDeal(uint64 _deal_id) public onlyOwner returns (bool) {
        require(deals[_deal_id].time_limit < block.timestamp * 1000, "time is not over");
        require(deals[_deal_id].buyer != address(0), "deal_id is not exist");
        require(deals[_deal_id].status != Status.Success, "deal was successfully ended");

        deals[_deal_id].status = Status.Canceled;

        _remove(_deal_id);

        emit DealCanceled(_deal_id, deals[_deal_id].buyer, deals[_deal_id].seller);

        return true;
    }

    /* internal remover for canceled and successfull deals */
    function _remove(uint64 _deal_id) internal {
        require(ongoingDeals.length != 0, "no ongoing deals");
        require(inDeal[deals[_deal_id].buyer].length != 0, "not in deals");

        for (uint64 i = 0; i < ongoingDeals.length; i++) {
            if (ongoingDeals[i] == _deal_id) {
                uint64 index = i;
                for (uint64 k = index; k < ongoingDeals.length - 1; k++) {
                    ongoingDeals[k] = ongoingDeals[k + 1];
                }
                ongoingDeals.pop();
            }
        }

        for (uint64 i = 0; i < inDeal[deals[_deal_id].buyer].length; i++) {
            if (inDeal[deals[_deal_id].buyer][i] == _deal_id) {
                uint64 index = i;
                for (uint64 k = index; k < inDeal[deals[_deal_id].buyer].length - 1; k++) {
                    inDeal[deals[_deal_id].buyer][k] = inDeal[deals[_deal_id].buyer][k + 1];
                }
                inDeal[deals[_deal_id].buyer].pop();
            }
        }
    }

    /* get USDT balance */
    function getUSDTBalance(address account) public view returns (uint256) {
        return usdt.balanceOf(account);
    }

    /* withdraw all funds from SC to owner if no deals */
    function withdraw() public onlyOwner returns (bool) {
        require(ongoingDeals.length == 0, "ongoingDeals");

        usdt.safeTransfer(msg.sender, getUSDTBalance(address(this)));
        address payable to = payable(msg.sender);
        to.transfer(address(this).balance);
        return true;
    }

    /* get caller current deals? */
    function isAddressInDeal() public view returns (uint64[] memory) {
        return inDeal[msg.sender];
    }

    /* get deal data */
    function getDeal(uint64 _deal_id) public view returns (Deal memory) {
        return deals[_deal_id];
    }

    /* get ongoing deal id's */
    function getOngoingDeals() public view returns(uint64[] memory) {
        return ongoingDeals;
    }

    /* get all time amounts and deals count */
    function getFullAmounts() public view returns(uint64[3] memory) {
        return [fullMassaAmount, fullUsdtAmount, last_deal_id];
    }

    receive() external payable {}
}
