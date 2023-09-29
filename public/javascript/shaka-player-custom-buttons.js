TheaterButton = class extends shaka.ui.Element {
  constructor(parent, controls) {
    super(parent, controls);
	
    this.button_ = document.createElement('button');
	
	this.button_.classList.add('material-icons-round');
	this.button_.classList.add('shaka-theater-button');
	
    this.button_.innerHTML = '<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%"><path d="m 28,11 0,14 -20,0 0,-14 z m -18,2 16,0 0,10 -16,0 0,-10 z" fill="#fff" fill-rule="evenodd" id="ytp-id-255"></path></svg>';
	
    this.parent.appendChild(this.button_);
	
	var isShowingTheaterMode = false;
    this.eventManager.listen(this.button_, 'click', () => {
	  if(isShowingTheaterMode) {
		  isShowingTheaterMode = false;
		  
		  this.button_.innerHTML = '<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%"><path d="m 28,11 0,14 -20,0 0,-14 z m -18,2 16,0 0,10 -16,0 0,-10 z" fill="#fff" fill-rule="evenodd" id="ytp-id-255"></path></svg>';
		  
		  $('#video-player-container').addClass('ratio');
		  $('#adaptive-video-player').removeClass('adaptive-video-player-theater-mode');
		  $("#video-player-container").prependTo("#video-comments-inner");
	  }
	  else {
		  isShowingTheaterMode = true;
		  
		  this.button_.innerHTML = '<svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%"><path d="m 26,13 0,10 -16,0 0,-10 z m -14,2 12,0 0,6 -12,0 0,-6 z" fill="#fff" fill-rule="evenodd" id="ytp-id-270"></path></svg>';
		  
		  $('#video-player-container').removeClass('ratio');
		  $('#adaptive-video-player').addClass('adaptive-video-player-theater-mode');
		  $("#video-player-container").appendTo("#theater-container");
	  }
    });
  }
};

TheaterButton.Factory = class {
  create(rootElement, controls) {
    return new TheaterButton(rootElement, controls);
  }
};