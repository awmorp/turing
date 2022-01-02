/* JavaScript Turing machine emulator
 * Anthony Morphett - awmorp@gmail.com
 *
 * With contributions from Erez Wanderman, Etai Gross and Greg Bacon
 */

/* Version 2.0 - January 2015 */
/* Uses jquery (1.11.1) */

/* TODO:
     - factorial sample program ?
*/


var nDebugLevel = 0;

var bFullSpeed = false;	/* If true, run at full speed with no delay between steps */

var bIsReset = false;		/* true if the machine has been reset, false if it is or has been running */
var sTape = "";				/* Contents of TM's tape. Stores all cells that have been visited by the head */
var nTapeOffset = 0;		/* the logical position on TM tape of the first character of sTape */
var nHeadPosition = 0;		/* the position of the TM's head on its tape. Initially zero; may be negative if TM moves to left */
var sState = "0";
var nSteps = 0;
var nVariant = 0; /* Machine variant. 0 = standard infinite tape, 1 = tape infinite in one direction only, 2 = non-deterministic TM */
var hRunTimer = null;
var aProgram = new Object();
/* aProgram is a double asociative array, indexed first by state then by symbol.
   Its members are arrays of objects with properties newSymbol, action, newState, breakpoint and sourceLineNumber.
*/

var nMaxUndo = 10;  /* Maximum number of undo steps */
var aUndoList = [];
/* aUndoList is an array of 'deltas' in the form {previous-state, direction, previous-symbol}. */

/* Variables for the source line numbering, markers */
var nTextareaLines = -1;
var oTextarea;
var bIsDirty = true;	/* If true, source must be recompiled before running machine */
var oNextLineMarker = $("<div class='NextLineMarker'>Next<div class='NextLineMarkerEnd'></div></div>");
var oPrevLineMarker = $("<div class='PrevLineMarker'>Prev<div class='PrevLineMarkerEnd'></div></div>");
var oPrevInstruction = null;

var sPreviousStatusMsg = "";  /* Most recent status message, for flashing alerts */


/* Step(): run the Turing machine for one step. Returns false if the machine is in halt state at the end of the step, true otherwise. */
function Step()
{
	if( bIsDirty) Compile();
	
	bIsReset = false;
	if( sState.substring(0,4).toLowerCase() == "halt" ) {
		/* debug( 1, "Warning: Step() called while in halt state" ); */
		SetStatusMessage( "Halted." );
		EnableControls( false, false, false, true, true, true, true );
		return( false );
	}
	
	var sNewState, sNewSymbol, nAction, nLineNumber;
	
	/* Get current symbol */
	var sHeadSymbol = GetTapeSymbol( nHeadPosition );
	
	/* Find appropriate TM instruction */
	var aInstructions = GetNextInstructions( sState, sHeadSymbol );
	var oInstruction;
	if( aInstructions.length == 0 ) {
    // No matching instruction found. Error handled below.
    oInstruction = null;
	} else if( nVariant == 2 ) {
    // Non-deterministic TM. Choose an instruction at random.
    oInstruction = aInstructions[Math.floor(Math.random()*aInstructions.length)];
	} else {
    // Deterministic TM. Choose the first (and only) instruction.
    oInstruction = aInstructions[0];
	}
	
	if( oInstruction != null ) {
		sNewState = (oInstruction.newState == "*" ? sState : oInstruction.newState);
		sNewSymbol = (oInstruction.newSymbol == "*" ? sHeadSymbol : oInstruction.newSymbol);
		nAction = (oInstruction.action.toLowerCase() == "r" ? 1 : (oInstruction.action.toLowerCase() == "l" ? -1 : 0));
    if( nVariant == 1 && nHeadPosition == 0 && nAction == -1 ) {
      nAction = 0;  /* Can't move left when already at left-most tape cell. */
    }
		nLineNumber = oInstruction.sourceLineNumber;
	} else {
		/* No matching rule found; halt */
		debug( 1, "Warning: no instruction found for state '" + sState + "' symbol '" + sHeadSymbol + "'; halting" );
		SetStatusMessage( "Halted. No rule for state '" + sState + "' and symbol '" + sHeadSymbol + "'.", 2 );
		sNewState = "halt";
		sNewSymbol = sHeadSymbol;
		nAction = 0;
		nLineNumber = -1;
	}
	
	/* Save undo information */
  if( nMaxUndo > 0 ) {
    if( aUndoList.length >= nMaxUndo ) aUndoList.shift();  /* Discard oldest undo entry */
    aUndoList.push({state: sState, position: nHeadPosition, symbol: sHeadSymbol});
  }
	
	/* Update machine tape & state */
	SetTapeSymbol( nHeadPosition, sNewSymbol );
	sState = sNewState;
	nHeadPosition += nAction;
	
	nSteps++;
	
	oPrevInstruction = oInstruction;
	
	debug( 4, "Step() finished. New tape: '" + sTape + "'  new state: '" + sState + "'  action: " + nAction + "  line number: " + nLineNumber  );
	UpdateInterface();
	
	if( sNewState.substring(0,4).toLowerCase() == "halt" ) {
		if( oInstruction != null ) {
			SetStatusMessage( "Halted." );
		} 
		EnableControls( false, false, false, true, true, true, true );
		return( false );
	} else {
		if( oInstruction.breakpoint ) {
			SetStatusMessage( "Stopped at breakpoint on line " + (nLineNumber+1) );
			EnableControls( true, true, false, true, true, true, true );
			return( false );
		} else {
			return( true );
		}
	}
}

/* Undo(): undo a single step of the machine */
function Undo()
{
  var oUndoData = aUndoList.pop();
  if( oUndoData ) {
    nSteps--;
    sState = oUndoData.state;
    nHeadPosition = oUndoData.position;
    SetTapeSymbol( nHeadPosition, oUndoData.symbol );
    oPrevInstruction = null;
    debug( 3, "Undone one step. New state: '" + sState + "' position : " + nHeadPosition + " symbol: '" + oUndoData.symbol + "'" );
    EnableControls( true, true, false, true, true, true, true );
    SetStatusMessage( "Undone one step." /*+ (aUndoList.length == 0 ? " No more undoes available." : " (" + aUndoList.length + " remaining)")*/ );
    UpdateInterface();
  } else {
    debug( 1, "Warning: Tried to undo with no undo data available!" );
  }
}


/* Run(): run the TM until it halts or until user interrupts it */
function Run()
{
  var bContinue = true;
  if( bFullSpeed ) {
    /* Run 25 steps at a time in fast mode */
    for( var i = 0; bContinue && i < 25; i++ ) {
      bContinue = Step();
    }
    if( bContinue ) hRunTimer = window.setTimeout( Run, 10 );
    else UpdateInterface();   /* Sometimes updates get lost at full speed... */
  } else {
    /* Run a single step every 50ms in slow mode */
    if( Step() ) {
      hRunTimer = window.setTimeout( Run, 50 );
    }
  }
}

/* RunStep(): triggered by the run timer. Calls Step(); stops running if Step() returns false. */
function RunStep()
{
	if( !Step() ) {
		StopTimer();
	}
}

/* StopTimer(): Deactivate the run timer. */
function StopTimer()
{
	if( hRunTimer != null ) {
		window.clearInterval( hRunTimer );
		hRunTimer = null;
	}
}


/* Reset( ): re-initialise the TM */
function Reset()
{
	var sInitialTape = $("#InitialInput")[0].value;

	/* Find the initial head location, if given */
	nHeadPosition = sInitialTape.indexOf( "*" );
	if( nHeadPosition == -1 ) nHeadPosition = 0;

	/* Initialise tape */
	sInitialTape = sInitialTape.replace( /\*/g, "" ).replace( / /g, "_" );
	if( sInitialTape == "" ) sInitialTape = " ";
	sTape = sInitialTape;
	nTapeOffset = 0;
	
	/* Initialise state */
	var sInitialState = $("#InitialState")[0].value;
	sInitialState = $.trim( sInitialState ).split(/\s+/)[0];
	if( !sInitialState || sInitialState == "" ) sInitialState = "0";
	sState = sInitialState;
	
	/* Initialise variant */
  var dropdown = $("#MachineVariant")[0];
  nVariant = Number(dropdown.options[dropdown.selectedIndex].value);
  SetupVariantCSS();
	
	nSteps = 0;
	bIsReset = true;
	
	Compile();
	oPrevInstruction = null;
	
	aUndoList = [];
	
	ShowResetMsg(false);
	EnableControls( true, true, false, true, true, true, false );
	UpdateInterface();
}

function createTuringInstructionFromTuple( tuple, line )
{
	return {
		newSymbol: tuple.newSymbol,
		action: tuple.action,
		newState: tuple.newState,
		sourceLineNumber: line,
		breakpoint: tuple.breakpoint
	};
}

function isArray( possiblyArr )
{
	Object.prototype.toString.call(possiblyArr) === "[object Array]";
}

/* Compile(): parse the inputted program and store it in aProgram */
function Compile()
{
	var sSource = oTextarea.value;
	debug( 2, "Compile()" );
	
	/* Clear syntax error messages */
	SetSyntaxMessage( null );
	ClearErrorLines();
	
	/* clear the old program */
	aProgram = new Object;
	
	sSource = sSource.replace( /\r/g, "" );	/* Internet Explorer uses \n\r, other browsers use \n */
	
	var aLines = sSource.split("\n");
	for( var i = 0; i < aLines.length; i++ )
	{
		var oTuple = ParseLine( aLines[i], i );
		if( oTuple.isValid ) {
			debug( 5, " Parsed tuple: '" + oTuple.currentState + "'  '" + oTuple.currentSymbol + "'  '" + oTuple.newSymbol + "'  '" + oTuple.action + "'  '" + oTuple.newState + "'" );
			if( aProgram[oTuple.currentState] == null ) aProgram[oTuple.currentState] = new Object;
			if( aProgram[oTuple.currentState][oTuple.currentSymbol] == null ) {
        aProgram[oTuple.currentState][oTuple.currentSymbol] = [];
			}
			if( aProgram[oTuple.currentState][oTuple.currentSymbol].length > 0 && nVariant != 2 ) {
        // Multiple conflicting instructions found.
        debug( 1, "Warning: multiple definitions for state '" + oTuple.currentState + "' symbol '" + oTuple.currentSymbol + "' on lines " + (aProgram[oTuple.currentState][oTuple.currentSymbol][0].sourceLineNumber+1) + " and " + (i+1) );
        SetSyntaxMessage( "Warning: Multiple definitions for state '" + oTuple.currentState + "' symbol '" + oTuple.currentSymbol + "' on lines " + (aProgram[oTuple.currentState][oTuple.currentSymbol][0].sourceLineNumber+1) + " and " + (i+1) );
        SetErrorLine( i );
        SetErrorLine( aProgram[oTuple.currentState][oTuple.currentSymbol][0].sourceLineNumber );
        aProgram[oTuple.currentState][oTuple.currentSymbol][0] = createTuringInstructionFromTuple( oTuple, i );
			} else {
        aProgram[oTuple.currentState][oTuple.currentSymbol].push( createTuringInstructionFromTuple( oTuple, i ) );
      }
		}
		else if( oTuple.error )
		{
			/* Syntax error */
			debug( 2, "Syntax error: " + oTuple.error );
			SetSyntaxMessage( oTuple.error );
			SetErrorLine( i );
		}
	}
	
	/* Set debug level, if specified */
	oRegExp = new RegExp( ";.*\\$DEBUG: *(.+)" );
	aResult = oRegExp.exec( sSource );
	if( aResult != null && aResult.length >= 2 ) {
		var nNewDebugLevel = parseInt( aResult[1] );
		if( nNewDebugLevel != nDebugLevel ) {
			nDebugLevel = parseInt( aResult[1] );
			debug( 1, "Setting debug level to " + nDebugLevel );
			if( nDebugLevel > 0 ) $(".DebugClass").toggle( true );
		}
	}
	
	/* Lines have changed. Previous line is no longer meaningful, recalculate next line. */
	oPrevInstruction = null;
	
	bIsDirty = false;
	
	UpdateInterface();
}

function ParseLine( sLine, nLineNum )
{
	/* discard anything following ';' */
	debug( 5, "ParseLine( " + sLine + " )" );
	sLine = sLine.split( ";", 1 )[0];

	/* split into tokens - separated by tab or space */
	var aTokens = sLine.split(/\s+/);
	aTokens = aTokens.filter( function (arg) { return( arg != "" ) ;} );
/*	debug( 5, " aTokens.length: " + aTokens.length );
	for( var j in aTokens ) {
		debug( 1, "  aTokens[ " + j + " ] = '" + aTokens[j] + "'" );
	}*/

	var oTuple = new Object;
	
	if( aTokens.length == 0 )
	{
		/* Blank or comment line */
		oTuple.isValid = false;
		return( oTuple );
	}
	
	oTuple.currentState = aTokens[0];
	
	if( aTokens.length < 2 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": missing <current symbol>!" ;
		return( oTuple );
	}
	if( aTokens[1].length > 1 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": <current symbol> should be a single character!" ;
		return( oTuple );
	}
	oTuple.currentSymbol = aTokens[1];
	
	if( aTokens.length < 3 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": missing <new symbol>!" ;
		return( oTuple );
	}
	if( aTokens[2].length > 1 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": <new symbol> should be a single character!" ;
		return( oTuple );
	}
	oTuple.newSymbol = aTokens[2];
	
	if( aTokens.length < 4 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": missing <direction>!" ;
		return( oTuple );
	}
	if( ["l","r","*"].indexOf( aTokens[3].toLowerCase() ) < 0 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": <direction> should be 'l', 'r' or '*'!";
		return( oTuple );
	}
	oTuple.action = aTokens[3].toLowerCase();

	if( aTokens.length < 5 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": missing <new state>!" ;
		return( oTuple );
	}
	oTuple.newState = aTokens[4];
	
	if( aTokens.length > 6 ) {
		oTuple.isValid = false;
		oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": too many entries!" ;
		return( oTuple );
	}
	if( aTokens.length == 6 ) {		/* Anything other than '!' in position 6 is an error */
		if( aTokens[5] == "!" ) {
			oTuple.breakpoint = true;
		} else {
			oTuple.isValid = false;
			oTuple.error = "Syntax error on line " + (nLineNum + 1) + ": too many entries!";
			return( oTuple );
		}
	} else {
		oTuple.breakpoint = false;
	}

	oTuple.isValid = true;
	return( oTuple );
}

// Get all applicable instructions for the given state and symbol.
// Returns an array of instructions, to support non-deterministic machines.
function GetNextInstructions( sState, sHeadSymbol )
{
  var result = null;
	if( aProgram[sState] != null && aProgram[sState][sHeadSymbol] != null ) {
		/* Use instructions specifically corresponding to current state & symbol, if any */
		return( aProgram[sState][sHeadSymbol] );
	} else if( aProgram[sState] != null && aProgram[sState]["*"] != null ) {
		/* Next use rules for the current state and default symbol, if any */
		return( aProgram[sState]["*"] );
	} else if( aProgram["*"] != null && aProgram["*"][sHeadSymbol] != null ) {
		/* Next use rules for default state and current symbol, if any */
		return( aProgram["*"][sHeadSymbol] );
	} else if( aProgram["*"] != null && aProgram["*"]["*"] != null ) {
		/* Finally use rules for default state and default symbol */
		return( aProgram["*"]["*"] );
	} else {
    return( [] );
  }
}

/* GetTapeSymbol( n ): returns the symbol at cell n of the TM tape */
function GetTapeSymbol( n )
{
	if( n < nTapeOffset || n >= sTape.length + nTapeOffset ) {
		debug( 4, "GetTapeSymbol( " + n + " ) = '" + c + "'   outside sTape range" );
		return( "_" );
	} else {
		var c = sTape.charAt( n - nTapeOffset );
		if( c == " " ) { c = "_"; debug( 4, "Warning: GetTapeSymbol() got SPACE not _ !" ); }
		debug( 4, "GetTapeSymbol( " + n + " ) = '" + c + "'" );
		return( c );
	}
}


/* SetTapeSymbol( n, c ): writes symbol c to cell n of the TM tape */
function SetTapeSymbol( n, c )
{
	debug( 4, "SetTapeSymbol( " + n + ", " + c + " ); sTape = '" + sTape + "' nTapeOffset = " + nTapeOffset );
	if( c == " " ) { c = "_"; debug( 4, "Warning: SetTapeSymbol() with SPACE not _ !" ); }
	
	if( n < nTapeOffset ) {
		sTape = c + repeat( "_", nTapeOffset - n - 1 ) + sTape;
		nTapeOffset = n;
	} else if( n > nTapeOffset + sTape.length ) {
		sTape = sTape + repeat( "_", nTapeOffset + sTape.length - n - 1 ) + c;
	} else {
		sTape = sTape.substr( 0, n - nTapeOffset ) + c + sTape.substr( n - nTapeOffset + 1 );
	}
}


/* SaveMachineSnapshot(): Store the current machine and state as an object suitable for saving as JSON */
function SaveMachineSnapshot()
{
	return( {
		"program": oTextarea.value,
		"state": sState,
		"tape": sTape,
		"tapeoffset": nTapeOffset,
		"headposition": nHeadPosition,
		"steps": nSteps,
		"initialtape": $("#InitialInput")[0].value,
		"initialstate": $("#InitialState")[0].value,
		"fullspeed": bFullSpeed,
		"variant": nVariant,
		"version": 1		/* Internal version number */
	});
}

/* LoadMachineState(): Load a machine and state from an object created by SaveMachineSnapshot */
function LoadMachineSnapshot( oObj )
{
	if( oObj.version && oObj.version != 1 ) debug( 1, "Warning: saved machine has unknown version number " + oObj.version );
	if( oObj.program ) oTextarea.value = oObj.program;
	if( oObj.state ) sState = oObj.state;
	if( oObj.tape ) sTape = oObj.tape;
	if( oObj.tapeoffset ) nTapeOffset = oObj.tapeoffset;
	if( oObj.headposition ) nHeadPosition = oObj.headposition;
	if( oObj.steps ) nSteps = oObj.steps;
	if( oObj.initialtape ) $("#InitialInput")[0].value = oObj.initialtape;
	if( oObj.initialstate ) {
		$("#InitialState")[0].value = oObj.initialstate;
	} else {
		$("#InitialState")[0].value = "";
	}
	if( oObj.fullspeed ) {
		$("#SpeedCheckbox")[0].checked = oObj.fullspeed;
		bFullSpeed = oObj.fullspeed;
	}
	if( oObj.variant ) {
	  nVariant = oObj.variant;
	} else {
    nVariant = 0;
	}
	$("#MachineVariant").val(nVariant);
	VariantChanged(false);
	SetupVariantCSS();
	aUndoList = [];
	if( sState.substring(0,4).toLowerCase() == "halt" ) {
		SetStatusMessage( "Machine loaded. Halted.", 1 );
		EnableControls( false, false, false, true, true, true, true );
	} else {
		SetStatusMessage( "Machine loaded and ready", 1  );
		EnableControls( true, true, false, true, true, true, true );
	}
	TextareaChanged();
	Compile();
	UpdateInterface();
}


/* SetStatusMessage(): display sString in the status message area */
/* nBgFlash: 1: flash green for success; 2: flash red for failure; -1: do not flash, even if repeating a message */
function SetStatusMessage( sString, nBgFlash )
{
	$( "#MachineStatusMsgText" ).text( sString );
  if( nBgFlash > 0 ) {
    $("#MachineStatusMsgBg").stop(true, true).css("background-color",(nBgFlash==1?"#c9f2c9":"#ffb3b3")).show().fadeOut(600);
  }
  if( sString != "" && sPreviousStatusMsg == sString && nBgFlash != -1 ) {
    $("#MachineStatusMsgBg").stop(true, true).css("background-color","#bbf8ff").show().fadeOut(600);
  }
  if( sString != "" ) sPreviousStatusMsg = sString;
}

/* SetSyntaxMessage(): display a syntax error message in the textarea */
function SetSyntaxMessage( msg )
{
	$("#SyntaxMsg").text( (msg?msg:"") )
}

/* RenderTape(): show the tape contents and head position in the MachineTape div */
function RenderTape()
{
	/* calculate the strings:
	  sFirstPart is the portion of the tape to the left of the head
	  sHeadSymbol is the symbol under the head
	  sSecondPart is the portion of the tape to the right of the head
	*/
	var nTranslatedHeadPosition = nHeadPosition - nTapeOffset;  /* position of the head relative to sTape */
	var sFirstPart, sHeadSymbol, sSecondPart;
	debug( 4, "RenderTape: translated head pos: " + nTranslatedHeadPosition + "  head pos: " + nHeadPosition + "  tape offset: " + nTapeOffset );
	debug( 4, "RenderTape: sTape = '" + sTape + "'" );

	if( nTranslatedHeadPosition > 0 ) {
		sFirstPart = sTape.substr( 0, nTranslatedHeadPosition );
	} else {
		sFirstPart = "";
	}
	if( nTranslatedHeadPosition > sTape.length ) {  /* Need to append blanks to sFirstPart.  Shouldn't happen but just in case. */
		sFirstPart += repeat( " ", nTranslatedHeadPosition - sTape.length );
	}
	sFirstPart = sFirstPart.replace( /_/g, " " );
	
	if( nTranslatedHeadPosition >= 0 && nTranslatedHeadPosition < sTape.length ) {
		sHeadSymbol = sTape.charAt( nTranslatedHeadPosition );
	} else {
		sHeadSymbol = " ";	/* Shouldn't happen but just in case */
	}
	sHeadSymbol = sHeadSymbol.replace( /_/g, " " );
	
	if( nTranslatedHeadPosition >= 0 && nTranslatedHeadPosition < sTape.length - 1 ) {
		sSecondPart = sTape.substr( nTranslatedHeadPosition + 1 );
	} else if( nTranslatedHeadPosition < 0 ) {  /* Need to prepend blanks to sSecondPart. Shouldn't happen but just in case. */
		sSecondPart = repeat( " ", -nTranslatedHeadPosition - 1 ) + sTape;
	} else {  /* nTranslatedHeadPosition > sTape.length */
		sSecondPart = "";
	}
	sSecondPart = sSecondPart.replace( /_/g, " " );
	
	debug( 4, "RenderTape: sFirstPart = '" + sFirstPart + "' sHeadSymbol = '" + sHeadSymbol + "'  sSecondPart = '" + sSecondPart + "'" );
	
	/* Display the parts of the tape */
	$("#LeftTape").text( sFirstPart );
	$("#ActiveTape").text( sHeadSymbol );
	$("#RightTape").text( sSecondPart );
//	debug( 4, "RenderTape(): LeftTape = '" + $("#LeftTape").text() + "' ActiveTape = '" + $("#ActiveTape").text() + "' RightTape = '" + $("#RightTape").text() + "'" );
	
	/* Scroll tape display to make sure that head is visible */
	if( $("#ActiveTapeArea").position().left < 0 ) {
		$("#MachineTape").scrollLeft( $("#MachineTape").scrollLeft() + $("#ActiveTapeArea").position().left - 10 );
	} else if( $("#ActiveTapeArea").position().left + $("#ActiveTapeArea").width() > $("#MachineTape").width() ) {
		$("#MachineTape").scrollLeft( $("#MachineTape").scrollLeft() + ($("#ActiveTapeArea").position().left - $("#MachineTape").width()) + 10 );
	}
}

function RenderState()
{
	$("#MachineState").text( sState );
}

function RenderSteps()
{
	$("#MachineSteps").text( nSteps );
}

function RenderLineMarkers()
{
  var oNextList = $.map(GetNextInstructions( sState, GetTapeSymbol( nHeadPosition ) ), function(x){return(x.sourceLineNumber);} );
	debug( 3, "Rendering line markers: " + (oNextList) + " " + (oPrevInstruction?oPrevInstruction.sourceLineNumber:-1) );
	SetActiveLines( oNextList, (oPrevInstruction?oPrevInstruction.sourceLineNumber:-1) );
}

/* UpdateInterface(): refresh the tape, state and steps displayed on the page */
function UpdateInterface()
{
	RenderTape();
	RenderState();
	RenderSteps();
	RenderLineMarkers();
}

function ClearDebug()
{
	$("#debug").empty();
}

function EnableControls( bStep, bRun, bStop, bReset, bSpeed, bTextarea, bUndo )
{
  document.getElementById( 'StepButton' ).disabled = !bStep;
  document.getElementById( 'RunButton' ).disabled = !bRun;
  document.getElementById( 'StopButton' ).disabled = !bStop;
  document.getElementById( 'ResetButton' ).disabled = !bReset;
  document.getElementById( 'SpeedCheckbox' ).disabled = !bSpeed;
  document.getElementById( 'Source' ).disabled = !bTextarea;
  EnableUndoButton(bUndo);
  if( bSpeed ) {
    $( "#SpeedCheckboxLabel" ).removeClass( "disabled" );
  } else {
    $( "#SpeedCheckboxLabel" ).addClass( "disabled" );
  }
}

function EnableUndoButton(bUndo)
{
  document.getElementById( 'UndoButton' ).disabled = !(bUndo && aUndoList.length > 0);
}

/* Trigger functions for the buttons */

function StepButton()
{
	SetStatusMessage( "", -1 );
	Step();
	EnableUndoButton(true);
}

function RunButton()
{
	SetStatusMessage( "Running..." );
	/* Make sure that the step interval is up-to-date */
	SpeedCheckbox();
	EnableControls( false, false, true, false, false, false, false );
	Run();
}

function StopButton()
{
	if( hRunTimer != null ) {
		SetStatusMessage( "Paused; click 'Run' or 'Step' to resume." );
		EnableControls( true, true, false, true, true, true, true );
		StopTimer();
	}
}

function ResetButton()
{
	SetStatusMessage( "Machine reset. Click 'Run' or 'Step' to start." );
	Reset();
	EnableControls( true, true, false, true, true, true, false );
}

function SpeedCheckbox()
{
  bFullSpeed = $( '#SpeedCheckbox' )[0].checked;
}

function VariantChanged(needWarning)
{
  var dropdown = $("#MachineVariant")[0];
  var selected = Number(dropdown.options[dropdown.selectedIndex].value);
  var descriptions = {
    0: "Standard Turing machine with tape infinite in both directions",
    1: "Turing machine with tape infinite in one direction only (as used in, eg, <a href='http://math.mit.edu/~sipser/book.html'>Sipser</a>)",
    2: "Non-deterministic Turing machine which allows multiple rules for the same state and symbol pair, and chooses one at random"
  };
  $("#MachineVariantDescription").html( descriptions[selected] );
  if( needWarning ) ShowResetMsg(true);
}

function SetupVariantCSS()
{
  if( nVariant == 1 ) {
    $("#LeftTape").addClass( "OneDirectionalTape" );
  } else {
    $("#LeftTape").removeClass( "OneDirectionalTape" );
  }
}

function ShowResetMsg(b)
{
  if( b ) {
    $("#ResetMessage").fadeIn();
    $("#ResetButton").addClass("glow");
  } else {
    $("#ResetMessage").hide();
    $("#ResetButton").removeClass("glow");
  }
}

function LoadFromCloud( sID )
{
	var n = sID.indexOf('&');
	sID = sID.substring(0, n != -1 ? n : sID.length);

	/* Get data from github */
	$.ajax({
		url: "https://api.github.com/gists/" + sID,
		type: "GET",
		dataType: "json",
		success: loadSuccessCallback,
		error: loadErrorCallback
	});
}

function loadSuccessCallback( oData )
{
	if( !oData || !oData.files || !oData.files["machine.json"] || !oData.files["machine.json"].content ) {
		debug( 1, "Error: Load AJAX request succeeded but can't find expected data." );
		SetStatusMessage( "Error loading saved machine :(", 2 );
		return;
	}
	var oUnpackedObject;
	try {
		oUnpackedObject = JSON.parse( oData.files["machine.json"].content );
	} catch( e ) {
		debug( 1, "Error: Exception when unpacking JSON: " + e );
		SetStatusMessage( "Error loading saved machine :(", 2 );
		return;
	}
	LoadMachineSnapshot( oUnpackedObject );
}

function loadErrorCallback( oData, sStatus, oRequestObj )
{
	debug( 1, "Error: Load failed. AJAX request to Github failed. HTTP response " + oRequestObj );
	SetStatusMessage( "Error loading saved machine :(", 2 );
}

function SaveToCloud()
{
	SetSaveMessage( "Saving...", null );
	var oState = SaveMachineSnapshot();
	
	var ajaxresult = $.ajax({
    url: "https://script.google.com/macros/s/AKfycbzOg5mPCsXDVGVzwmACPRwSvcfWLR2qrEW5Em46wZKO1FVFCAg/exec",
    type: "POST",
    data: JSON.stringify( oState ),
    dataType: "json",
//    contentType: 'application/json; charset=utf-8',
    contentType: 'text/plain; charset=utf-8', // Must be text/plain to avoid CORS issues. See https://github.com/tanaikech/taking-advantage-of-Web-Apps-with-google-apps-script#corsinwebapps
    success: saveSuccessCallback,
    error: saveErrorCallback
  });
}

function saveSuccessCallback( oData )
{
	if( oData && oData.id ) {
		var sURL = window.location.href.replace(/[\#\?].*/,"");		/* Strip off any hash or query parameters, ie "?12345678" */
		sURL += "?" + oData.id;									/* Append gist id as query string */
		//var sURL = "http://morphett.info/turing/turing.html" + "?" + oData.id;
		debug( 1, "Save successful. Gist ID is " + oData.id + " Gist URL is " + oData.url /*+ ", user URL is " + sURL */ );
		
		var oNow = new Date();
		
		var sTimestamp = (oNow.getHours() < 10 ? "0" + oNow.getHours() : oNow.getHours()) + ":" + (oNow.getMinutes() < 10 ? "0" + oNow.getMinutes() : oNow.getMinutes()) + ":" + (oNow.getSeconds() < 10 ? "0" + oNow.getSeconds() : oNow.getSeconds());/* + " " + oNow.toLocaleDateString();*/
		
		SetSaveMessage( "Saved! Your URL is <br><a href=" + sURL + ">" + sURL + "</a><br>Bookmark or share this link to access your saved machine.<br><span style='font-size: small; font-style: italic;'>Last saved at " + sTimestamp + "</span>", 1 );
		
	} else {
		debug( 1, "Error: Save failed. Missing data or id from Github response." );
		SetSaveMessage( "Save failed, sorry :(", 2 );
	}
}

function saveErrorCallback( oData, sStatus, oRequestObj )
{
	debug( 1, "Error: Save failed. AJAX request to Github failed. HTTP response " + oRequestObj );
//	console.log( "oData", oData, "sStatus", sStatus, "oRequestObj", oRequestObj );
	SetSaveMessage( "Save failed, sorry :(", 2 );
}

function SetSaveMessage( sStr, nBgFlash )
{
	$("#SaveStatusMsg").html( sStr );
	$("#SaveStatus").slideDown();
	if( nBgFlash ) {	/* Flash background of notification */
		$("#SaveStatusBg").stop(true, true).css("background-color",(nBgFlash==1?"#88ee99":"#eb8888")).show().fadeOut(800);
	}
}

function ClearSaveMessage()
{
	$("#SaveStatusMsg").empty();
	$("#SaveStatus").hide();
}

function LoadSampleProgram( zName, zFriendlyName, bInitial )
{
	debug( 1, "Load '" + zName + "'" );
	SetStatusMessage( "Loading sample program..." );
	var zFileName = "machines/" + zName + ".txt";
	
	StopTimer();   /* Stop machine, if currently running */
	
	$.ajax({
		url: zFileName,
		type: "GET",
		dataType: "text",
		success: function( sData, sStatus, oRequestObj ) {
			/* Load the default initial tape, if any */
			var oRegExp = new RegExp( ";.*\\$INITIAL_TAPE:? *(.+)$" );
			var aRegexpResult = oRegExp.exec( sData );
			if( aRegexpResult != null && aRegexpResult.length >= 2 ) {
				debug( 4, "Parsed initial tape: '" + aRegexpResult + "' length: " + (aRegexpResult == null ? "null" : aRegexpResult.length) );
				$("#InitialInput")[0].value = aRegexpResult[1];
				sData = sData.replace( /^.*\$INITIAL_TAPE:.*$/m, "" );
			}
			$("#InitialState")[0].value = "0";
			nVariant = 0;
			$("#MachineVariant").val(0);
			VariantChanged(false);
			/* TODO: Set up CSS */

			/* Load the program */
			oTextarea.value = sData;
			TextareaChanged();
			Compile();
			
			/* Reset the machine  */
			Reset();
			if( !bInitial ) SetStatusMessage( zFriendlyName + " successfully loaded", 1 );
		},
		error: function( oData, sStatus, oRequestObj ) {
			debug( 1, "Error: Load failed. HTTP response " + oRequestObj.status + " " + oRequestObj.statusText );
			SetStatusMessage( "Error loading " + zFriendlyName + " :(", 2 );
		}
	});
	
	$("#LoadMenu").slideUp();
	ClearSaveMessage();
}

/* onchange function for textarea */
function TextareaChanged()
{
	/* Update line numbers only if number of lines has changed */
	var nNewLines = (oTextarea.value.match(/\n/g) ? oTextarea.value.match(/\n/g).length : 0) + 1;
	if( nNewLines != nTextareaLines ) {
		nTextareaLines = nNewLines
		UpdateTextareaDecorations();
	}
	
//	Compile();
	bIsDirty = true;
	oPrevInstruction = null;
	RenderLineMarkers();
}

/* Generate line numbers for each line in the textarea */
function UpdateTextareaDecorations()
{
	var oBackgroundDiv = $("#SourceBackground");
	
	oBackgroundDiv.empty();
	
	var sSource = oTextarea.value;
	sSource = sSource.replace( /\r/g, "" );	/* Internet Explorer uses \n\r, other browsers use \n */
	
	var aLines = sSource.split("\n");
	
	for( var i = 0; i < aLines.length; i++)
	{
		oBackgroundDiv.append($("<div id='talinebg"+(i+1)+"' class='talinebg'><div class='talinenum'>"+(i+1)+"</div></div>"));
	}
	
	UpdateTextareaScroll();
}

/* Highlight given lines as the next/previous tuple */
/* next is a list of lines (to support nondeterministic TM), prev is a number */
function SetActiveLines( next, prev )
{
	$(".talinebgnext").removeClass('talinebgnext');
	$(".NextLineMarker").remove();
	$(".talinebgprev").removeClass('talinebgprev');
	$(".PrevLineMarker").remove();
	
  var shift = false;
	for( var i = 0; i < next.length; i++ )
	{
    var oMarker = $("<div class='NextLineMarker'>Next<div class='NextLineMarkerEnd'></div></div>");
    $("#talinebg"+(next[i]+1)).addClass('talinebgnext').prepend(oMarker);
    if( next[i] == prev ) {
      oMarker.addClass('shifted');
      shift = true;
    }
	}
	if( prev >= 0 )
	{
    var oMarker = $("<div class='PrevLineMarker'>Prev<div class='PrevLineMarkerEnd'></div></div>");
    if( shift ) {
      $("#talinebg"+(prev+1)).prepend(oMarker);
      oMarker.addClass('shifted');
    } else {
      $("#talinebg"+(prev+1)).addClass('talinebgprev').prepend(oMarker);
    }
	}
}

/* Highlight given line as an error */
function SetErrorLine( num )
{
	$("#talinebg"+(num+1)).addClass('talinebgerror');
}

/* Clear error highlights from all lines */
function ClearErrorLines()
{
	$(".talinebg").removeClass('talinebgerror');
}

/* Update the line numbers when textarea is scrolled */
function UpdateTextareaScroll()
{
	var oBackgroundDiv = $("#SourceBackground");
	
	$(oBackgroundDiv).css( {'margin-top': (-1*$(oTextarea).scrollTop()) + "px"} );
}


function AboutMenuClicked( name )
{
	$(".AboutItem").css( "font-weight", "normal" );
	$("#AboutItem" + name).css( "font-weight", "bold" );

	$(".AboutContent").slideUp({queue: false, duration: 150}).fadeOut(150);
	$("#AboutContent" + name ).stop().detach().prependTo("#AboutContentContainer").fadeIn({queue: false, duration: 150}).css("display", "none").slideDown(150);
}


/* OnLoad function for HTML body.  Initialise things when page is loaded. */
function OnLoad()
{
	if( nDebugLevel > 0 ) $(".DebugClass").toggle( true );
	
	if( typeof( isOldIE ) != "undefined" ) {
		debug( 1, "Old version of IE detected, adding extra textarea events" );
		/* Old versions of IE need onkeypress event for textarea as well as onchange */
		$("#Source").on( "keypress change", TextareaChanged );
	}

	oTextarea = $("#Source")[0];
	TextareaChanged();
	
	VariantChanged(false); /* Set up variant description */
	
	if( window.location.search != "" ) {
		SetStatusMessage( "Loading saved machine..." );
		LoadFromCloud( window.location.search.substring( 1 ) );
		window.history.replaceState( null, "", window.location.pathname );  /* Remove query string from URL */
	} else {
		LoadSampleProgram( 'palindrome', 'Default program', true );
		SetStatusMessage( 'Load or write a Turing machine program and click Run!' );
	}
}


/* for testing */
function testsave( success )
{
	if( success ) {
		saveSuccessCallback( {id: "!!!WHACK!!!" + $.now(), url: "http://wha.ck/xxx"} );
	} else {
		saveErrorCallback( {id: "!!!WHACK!!!" + $.now(), url: "http://wha.ck/xxx"}, null, {status: -1, statusText: 'dummy'} );
	}
}

/* return a string of n copies of c */
function repeat( c, n )
{
	var sTmp = "";
	while( n-- > 0 ) sTmp += c;
	return sTmp;
}


function debug( n, str )
{
	if( n <= 0 ) {
		SetStatusMessage( str );
		console.log( str );
	}
	if( nDebugLevel >= n  ) {
		$("#debug").append( document.createTextNode( str + "\n" ) );
		console.log( str );
	}
}

