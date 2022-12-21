const { assert, expect } = require("chai")
const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", async function () {
          let raffle,
              raffleContract,
              deployer,
              vrfCoordinatorV2,
              raffleEntranceFee,
              interval,
              player
          const chainId = network.config.chainId

          //const sendValue = ethers.utils.parseEther("1")
          beforeEach(async function () {
              accounts = await ethers.getSigners()
              player = accounts[0]
              const { deployer } = (await getNamedAccounts()).deployer
              await deployments.fixture("all")
              const raffleContract = await deployments.get("Raffle")
              raffle = await ethers.getContractAt(raffleContract.abi, raffleContract.address)
              //console.log(fundMe.getOwner())
              const vrfCoordinatorDeployment = await deployments.get("VRFCoordinatorV2Mock")
              vrfCoordinatorV2 = await ethers.getContractAt(
                  vrfCoordinatorDeployment.abi,
                  vrfCoordinatorDeployment.address
              )
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })
          describe("constructor", async function () {
              it("Sets the Raffle state correctly to open state", async function () {
                  const response = await raffle.getRaffleState()
                  assert.equal(response.toString(), "0")
              })
              it("Sets the interval correctly", async function () {
                  const response = await raffle.getInterval()
                  assert.equal(response.toString(), networkConfig[chainId]["interval"])
              })
              it("Sets the entrance fee correctly", async function () {
                  const response = await raffle.getEntranceFee()
                  assert.equal(response.toString(), networkConfig[chainId]["entranceFee"])
              })

              it("Sets the request confirmations correctly", async function () {
                  const response = await raffle.getRequestConfirmations()
                  assert.equal(response.toString(), "3")
              })
              it("Initializes the players array to 0 length", async function () {
                  const response = await raffle.getNumberOfPlayers()
                  assert.equal(response.toString(), "0")
              })
              it("Initializes the num words to 1", async function () {
                  const response = await raffle.getNumWords()
                  assert.equal(response.toString(), "1")
              })
              it("Recent winner is empty", async function () {
                  const response = await raffle.getRecentWinner()
                  assert.equal(response.toString(), "0x0000000000000000000000000000000000000000")
              })
          })
          describe("Enter Raffle", function () {
              it("Revert with error when enough ETH is not sent", async function () {
                  await expect(raffle.enterRaffle({ value: "0" })).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__SendMoreToEnterRaffle"
                  )
              })
              it("Revert with error when the raffle state is not open", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  // we pretend to be a keeper for a second
                  await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWithCustomError(
                      raffle,
                      // is reverted as raffle is calculating
                      "Raffle__RaffleNotOpen"
                  )
              })
              it("Player is correctly recorded in s_players after entry ", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const numOfPlayers = await raffle.getNumberOfPlayers()
                  assert.equal("1", numOfPlayers)
                  const contractPlayer = await raffle.getPlayer(0)
                  assert.equal(player.address, contractPlayer)
              })
              it("RaffleEnter event is emitted upon entry ", async function () {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })
          })
          describe("checkUpkeep", function () {
              it("Upkeep needed is false when the raffle is calculating", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
                  const raffleState = await raffle.getRaffleState()
                  //const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  const raffleStatetoBool = raffleState.toString() == "0"
                  assert.equal(raffleStatetoBool, upkeepNeeded)
              })
              it("Upkeep needed is false when the time interval between last and current is less than the set interval", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 10])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert.equal(false, upkeepNeeded)
              })
              it("Upkeep needed is false when there are no players/no balance", async function () {
                  //await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert.equal((await raffle.getNumberOfPlayers) > 0, upkeepNeeded)
              })
              it("Upkeep needed is true when (1)raffle state is open,(2) time interval has passed, (3) when there are players and (4) balance is greater than 0", async function () {
                  //await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("Revert with error when upKeep is not needed", async function () {
                  //await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  //await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded"
                  )
              })
              it("Sets the raffle state to calculating if checkUpKeep returns true", async function () {
                  //await raffle.enterRaffle({ value: raffleEntranceFee })
                  // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep("0x")
                  const raffleState = await raffle.getRaffleState()
                  assert(raffleState == "1")
              })
              it("Emits event with the request id when transaction is successful", async function () {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txResponse = await raffle.performUpkeep("0x")
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })
              it("can only be called after performupkeep", async () => {
                  await expect(
                      vrfCoordinatorV2.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoordinatorV2.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
              })

              // This test is too big...
              // This test simulates users entering the raffle and wraps the entire functionality of the raffle
              // inside a promise that will resolve if everything is successful.
              // An event listener for the WinnerPicked is set up
              // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
              // All the assertions are done once the WinnerPicked event is fired
              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3 // to test
                  const startingIndex = 2
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      // i = 2; i < 5; i=i+1
                      raffle = raffle.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp() // stores starting timestamp (before we fire our event)

                  // This will be more important for our staging tests...
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          // event listener for WinnerPicked
                          console.log("WinnerPicked event fired!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              // Now lets get the ending values...
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[2].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // Comparisons to check if our ending values are correct:
                              assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrances)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve() // if try passes, resolves the promise
                          } catch (e) {
                              reject(e) // if try fails, rejects the promise
                          }
                      })

                      // kicking off the event by mocking the chainlink keepers and vrf coordinator
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      const startingBalance = await accounts[2].getBalance()
                      await vrfCoordinatorV2.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
