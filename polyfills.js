/* Polyfills to make up for missing functionality in Internet Explorer */

if( !Array.prototype.filter ) {
/*  console.log( "Installing Array.filter polyfill" ); */
  Array.prototype.filter = function( fn, context ) {
    var i, l = this.length, result = [];
    for( i = 0; i < l; i++ ) {
      if( this.hasOwnProperty(i) ) {
        if( fn.call( context, this[i], i, this ) ) {
          result.push( this[i] );
        }
      }
    }
    return( result );
  };
}


if( !Array.prototype.indexOf ) {
/*  console.log( "Installing Array.indexOf polyfill" ); */
  Array.prototype.indexOf = function( obj, start ) {
    for( var i = (start ? start : 0), j = this.length; i < j; i += 1 ) {
      if( this[i] === obj ) {
        return( i );
      }
    }
    return( -1 );
  }
}

var isOldIE = true;