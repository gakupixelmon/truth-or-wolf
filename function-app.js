import { createViews } from "./function-ui/views.js";
import { createTutorial } from "./function-ui/tutorial.js";
import { bindEvents, bindSocketEvents } from "./function-ui/events.js";

const socket = io();
const app = document.querySelector("#app");

const state = {
  connected: false,
  room: null,
  game: null,
  privateAction: null,
  myFunction: null,
  nightTargetId: null,
  observation: null,
  attackResult: null,
  humanVotes: new Map(),
  voteResult: null,
  tutorialMode: false,
  tutorialStep: "",
  error: null,
};


let views;
let tutorial;

function render() {
  if (state.tutorialMode) {
    if (!state.game) tutorial.startTutorialGame();
    app.innerHTML = tutorial.tutorialStyle() + tutorial.tutorialBoard();
    app.innerHTML += state.game.outcome ? tutorial.tutorialOverlay() : tutorial.tutorialMessageOverlay();
    tutorial.bindEvents();
    return;
  }
  if (!state.room) app.innerHTML = views.setupScreen();
  else if (!state.game) app.innerHTML = views.lobbyScreen();
  else app.innerHTML = views.board();
  bindEvents({ state, socket, render });
}

views = createViews({ state });
tutorial = createTutorial({ state, views, render });
bindSocketEvents({ state, socket, render });
render();
