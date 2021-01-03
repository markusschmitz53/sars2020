import {ILoadingScreen} from '@babylonjs/core';

export class LoadingScreen implements ILoadingScreen {
  private _loadingDiv;
  public loadingUIBackgroundColor: string

  constructor(public loadingUIText: string) {
  }

  public displayLoadingUI() {
    if (document.getElementById("loadingScreenDiv")) {
      // Do not add a loading screen if there is already one
      document.getElementById("loadingScreenDiv").style.display = "initial";
      return;
    }
    this._loadingDiv = document.createElement("div");
    this._loadingDiv.id = "loadingScreenDiv";
    this._loadingDiv.innerHTML = this.loadingUIText;

    /*    this._resizeLoadingUI();
        window.addEventListener("resize", this._resizeLoadingUI);*/
    document.body.appendChild(this._loadingDiv);
  }

  public hideLoadingUI() {
    document.getElementById("loadingScreenDiv").style.display = "none";
  }
}