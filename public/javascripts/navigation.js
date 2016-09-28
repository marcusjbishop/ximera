define(['jquery', 'underscore', 'sly'], function($, _, Sly) {

    console.log( "THIS IS ONLY A DEMO OF NAVIGATIN" );
    
    $(function() {
	var options = {
	    horizontal: 1,
	    itemNav: 'centered',
	    easing: 'easeOutExpo',
	    smart: 1,
	    activateOn: 'click',
	    speed: 300,
	    startAt: $('.frame li').index( $('.frame li.active') ),
	    scrollHijack: 300,
	    scrollBar: '.scrollbar',
	    scrollBy: 1,
	    mouseDragging: 1,
	    touchDragging: 1,
	    releaseSwing: 1,
	    clickBar: 1,
	    dynamicHandle: 1,
	    dragHandle: 1,
	};
	
	var frame = new Sly('.course-navigation .frame', options).init();

	var resize = _.throttle( function() {
	    frame.reload();
	}, 100 );
	
	$(window).resize(resize);
	
	return;
    });
});

