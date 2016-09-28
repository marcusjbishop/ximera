define(['jquery', 'underscore', 'database', 'mathjax', 'tincan'], function($, _, database, MathJax, TinCan){
    var buttonTemplate = _.template( '<label class="btn btn-default <%= correct %>" id="<%= id %>"></label>' );

    var answerHtml = '<div class="btn-group" style="vertical-align: bottom; ">' +
	'<button class="btn btn-success btn-ximera-correct" data-toggle="tooltip" data-placement="top" title="Correct answer!" style="display: none">' +
	'<i class="fa fa-check"/>&nbsp;Correct' +
	'</button></div>' +
	'<div class="btn-group" style="vertical-align: bottom; ">' +
	'<button class="btn btn-danger btn-ximera-incorrect" data-toggle="tooltip" data-placement="top" title="Incorrect.  Try again!" style="display: none">' +
	'<i class="fa fa-times"/>&nbsp;Try again' +
	'</button></div>' +
	'<div class="btn-group" style="vertical-align: bottom; ">' +
	'<button class="btn btn-primary btn-ximera-submit" data-toggle="tooltip" data-placement="top" title="Click to check your answer.">' +
	'<i class="fa fa-question"/>&nbsp;Check work' +
	'</button>' +
	'</div>';
    
    var createMultipleChoice = function() {
	var multipleChoice = $(this);

	multipleChoice.wrapInner( '<div class="ximera-horizontal"><div class="btn-group-vertical" role="group" data-toggle="buttons" style="padding-right: 1em;"></div></div>' );
	
	$('.ximera-horizontal', multipleChoice).append( $(answerHtml) );

	multipleChoice.find( ".choice" ).each( function() {
	    var correct = '';
	    if ($(this).hasClass( "correct" ))
		correct = "correct";
	    
	    var identifier = $(this).attr('id');
	    var label = $(this);

	    label.wrap( buttonTemplate({ id: identifier, correct: correct }) );
	    label.prepend( '<input type="radio"></input>' );
	});

	multipleChoice.trigger( 'ximera:answer-needed' );
	
	multipleChoice.persistentData(function(event) {
	    multipleChoice.find( 'label').removeClass('active');
	    
	    if (multipleChoice.persistentData('chosen')) {
		multipleChoice.find( '#' + multipleChoice.persistentData('chosen') ).addClass('active');
		multipleChoice.find( '.btn-group button' ).removeClass('disabled');
		multipleChoice.find( '.btn-group .btn-ximera-submit' ).addClass('pulsate');
	    } else {
		multipleChoice.find( '.btn-group button' ).addClass('disabled');
		multipleChoice.find( '.btn-group .btn-ximera-submit' ).removeClass('pulsate');		
	    }

	    if (multipleChoice.persistentData('correct')) {
		multipleChoice.find( '.btn-group button' ).hide();
		multipleChoice.find( '.btn-group .btn-ximera-correct' ).show();
		
		multipleChoice.find( 'label' ).not( '.correct' ).addClass( 'disabled' );
		multipleChoice.find( 'label .correct' ).removeClass('disabled');
	    } else {
		multipleChoice.find( 'label' ).removeClass( 'disabled' );
	
		multipleChoice.find( 'label' ).filter( function() {
		    var wrongAnswers = multipleChoice.persistentData('wrong');
		    
		    return wrongAnswers && (wrongAnswers[$(this).attr('id')]);
		}).addClass( 'disabled' );	
		
		multipleChoice.find( '.btn-group button' ).hide();

		if ((multipleChoice.persistentData('checked') === multipleChoice.persistentData('chosen')) &&
		    (multipleChoice.persistentData('chosen') !== undefined))
		    multipleChoice.find( '.btn-group .btn-ximera-incorrect' ).show();
		else {
		    multipleChoice.find( '.btn-group .btn-ximera-submit' ).show();
		    multipleChoice.find( '.btn-group .btn-ximera-submit' ).show();		    
		}
	    }

	    multipleChoice.find( '.btn-ximera-submit' ).prop( 'disabled', ! multipleChoice.find( 'label' ).hasClass( 'active' ) );
	    multipleChoice.find( '.btn-ximera-incorrect' ).prop( 'disabled', ! multipleChoice.find( 'label' ).hasClass( 'active' ) );
	});

	var checkAnswer = function() {
	    if (multipleChoice.persistentData('chosen')) {
		multipleChoice.persistentData('checked', multipleChoice.persistentData('chosen') );
		
		multipleChoice.persistentData('correct',
					      multipleChoice.find('#' + multipleChoice.persistentData('chosen')).hasClass( 'correct' ) );

		if (multipleChoice.persistentData('correct')) {
		    multipleChoice.trigger( 'ximera:correct' );
		} else {
		    var wrongAnswers = multipleChoice.persistentData('wrong');
		    
		    if (!wrongAnswers)
			wrongAnswers = {};
		    
		    wrongAnswers[multipleChoice.persistentData('chosen')] = true;
		    multipleChoice.persistentData('wrong', wrongAnswers);
		}

		TinCan.answer( multipleChoice, { response: multipleChoice.persistentData('chosen'),
						 success: multipleChoice.persistentData('correct') } );
	    }
	};
	
	$(this).find( ".btn-ximera-submit" ).click( checkAnswer );
	$(this).find( ".btn-ximera-incorrect" ).click( checkAnswer );
	
	$(this).find( "label" ).each( function() {
	    $(this).click( function() {
		multipleChoice.persistentData('chosen', $(this).attr('id'));
	    });
	});
	
    };

    $.fn.extend({
	multipleChoice: function() {
	    return this.each( createMultipleChoice );
	}
    });
        
    return;
});
