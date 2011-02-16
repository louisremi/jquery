/* Current limitations:
 * - queue: false option doesn't work
 *
 * Cases where transition should be disabled:
 * - in incompatible browsers (Opera 11 included)
 * - when there is a special easing
 * - when there is a step function
 * - when jQuery.fx.off is true (should work out of the box)
 *
 * jQuery.fx.stop() won't pause transitions, but this is an undocumented method and behavior anyway.
 */
(function( jQuery ) {

var elemdisplay = {},
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = /^([+\-]=)?([\d+.\-]+)([a-z%]*)$/i,
	timerId,
	fxAttrs = [
		// height animations
		[ "height", "marginTop", "marginBottom", "paddingTop", "paddingBottom" ],
		// width animations
		[ "width", "marginLeft", "marginRight", "paddingLeft", "paddingRight" ],
		// opacity animations
		[ "opacity" ]
	];

// TRANSITION++
// Following feature test code should be moved to support.js
var div = document.createElement('div'),
	divStyle = div.style;
// Only test for transition support in Firefox and Webkit 
// as we know for sure that Opera has too much bugs (see http://csstransition.net)
// and there's no guarantee that first IE implementation will be bug-free
$.support.transition =
	divStyle.MozTransition === '' ? {name: 'MozTransition', end: 'transitionend'}:
	divStyle.WebkitTransition === '' ? {name: 'WebkitTransition', end: 'webkitTransitionEnd'}:
	false;
// prevent IE memory leak;
div = null;

// global transitionend event dispatcher
var transition = $.support.transition;
if ( transition ) {
	// following code is going to run on every transitionend, it has to be fast!
	window.addEventListener( transition.end, function(e) {
		var trans = jQuery.data(e.target, 'transition');
		if ( trans = effect && trans[jQuery.camelCase(e.propertyName)] ) {
			trans.step( true, transition );
			trans = null;
		}
	}, false );
}

jQuery.fn.extend({
	show: function( speed, easing, callback ) {
		var elem, display;

		if ( speed || speed === 0 ) {
			return this.animate( genFx("show", 3), speed, easing, callback);

		} else {
			for ( var i = 0, j = this.length; i < j; i++ ) {
				elem = this[i];
				display = elem.style.display;

				// Reset the inline display of this element to learn if it is
				// being hidden by cascaded rules or not
				if ( !jQuery._data(elem, "olddisplay") && display === "none" ) {
					display = elem.style.display = "";
				}

				// Set elements which have been overridden with display: none
				// in a stylesheet to whatever the default browser style is
				// for such an element
				if ( display === "" && jQuery.css( elem, "display" ) === "none" ) {
					jQuery._data(elem, "olddisplay", defaultDisplay(elem.nodeName));
				}
			}

			// Set the display of most of the elements in a second loop
			// to avoid the constant reflow
			for ( i = 0; i < j; i++ ) {
				elem = this[i];
				display = elem.style.display;

				if ( display === "" || display === "none" ) {
					elem.style.display = jQuery._data(elem, "olddisplay") || "";
				}
			}

			return this;
		}
	},

	hide: function( speed, easing, callback ) {
		if ( speed || speed === 0 ) {
			return this.animate( genFx("hide", 3), speed, easing, callback);

		} else {
			for ( var i = 0, j = this.length; i < j; i++ ) {
				var display = jQuery.css( this[i], "display" );

				if ( display !== "none" && !jQuery._data( this[i], "olddisplay" ) ) {
					jQuery._data( this[i], "olddisplay", display );
				}
			}

			// Set the display of the elements in a second loop
			// to avoid the constant reflow
			for ( i = 0; i < j; i++ ) {
				this[i].style.display = "none";
			}

			return this;
		}
	},

	// Save the old toggle function
	_toggle: jQuery.fn.toggle,

	toggle: function( fn, fn2, callback ) {
		var bool = typeof fn === "boolean";

		if ( jQuery.isFunction(fn) && jQuery.isFunction(fn2) ) {
			this._toggle.apply( this, arguments );

		} else if ( fn == null || bool ) {
			this.each(function() {
				var state = bool ? fn : jQuery(this).is(":hidden");
				jQuery(this)[ state ? "show" : "hide" ]();
			});

		} else {
			this.animate(genFx("toggle", 3), fn, fn2, callback);
		}

		return this;
	},

	fadeTo: function( speed, to, easing, callback ) {
		return this.filter(":hidden").css("opacity", 0).show().end()
					.animate({opacity: to}, speed, easing, callback);
	},

	animate: function( prop, speed, easing, callback ) {
		var optall = jQuery.speed(speed, easing, callback),
			// Fix #7917, synchronize animations.
			_startTime = optall.startTime;

		if ( jQuery.isEmptyObject( prop ) ) {
			return this.each( optall.complete );
		}

		return this[ optall.queue === false ? "each" : "queue" ](function() {
			// XXX 'this' does not always have a nodeName when running the
			// test suite

			var self = this,
				// cache jQuery properties to minimize lookups (and filesize)
				extend = jQuery.extend,
				style = jQuery.style,
				support = jQuery.support,
				css = jQuery.css,
				fx = jQuery.fx,
				startTime = _startTime,
				// cache end
				opt = extend({}, optall), p,
				isElement = self.nodeType === 1,
				hidden = isElement && jQuery(self).is(":hidden"),
				thisStyle = self.style,
				name, val, easing,
				display,
				e,
				parts, start, end, unit,
				// TRANSITION++
				cssHooks = jQuery.cssHooks,
				// disable transition if a step option is supplied
				supportTransition = support.transition && !opt.step,
				transition,
				transitions = [],
				queue = opt.queue !== false,
				hook;

			// jQuery.now() is called only once for all animated properties of all elements
			if (!startTime) {
				_startTime = startTime = jQuery.now();
			}

			// will store per property easing and be used to determine when an animation is complete
			opt.animatedProperties = {};
			// TRANSITION++
			// transition is enabled per property, when:
			// - there is no step function for the animation
			// - there is no special easing for the property
			opt.transition = {};

			for ( p in prop ) {

				// property name normalization
				name = jQuery.camelCase( p );
				if ( p !== name ) {
					prop[ name ] = prop[ p ];
					delete prop[ p ];
					p = name;
				}

				val = prop[p];

				if ( val === "hide" && hidden || val === "show" && !hidden ) {
					return opt.complete.call(self);
				}

				if ( isElement && ( p === "height" || p === "width" ) ) {
					// Make sure that nothing sneaks out
					// Record all 3 overflow attributes because IE does not
					// change the overflow attribute when overflowX and
					// overflowY are set to the same value
					opt.overflow = [ thisStyle.overflow, thisStyle.overflowX, thisStyle.overflowY ];

					// Set display property to inline-block for height/width
					// animations on inline elements that are having width/height
					// animated
					if ( css( self, "display" ) === "inline" &&
							css( self, "float" ) === "none" ) {
						if ( !support.inlineBlockNeedsLayout ) {
							thisStyle.display = "inline-block";

						} else {
							display = defaultDisplay(self.nodeName);

							// inline-level elements accept inline-block;
							// block-level elements need to be inline with layout
							if ( display === "inline" ) {
								thisStyle.display = "inline-block";

							} else {
								thisStyle.display = "inline";
								thisStyle.zoom = 1;
							}
						}
					}
				}

				// easing resolution: per property > opt.specialEasing > opt.easing > 'swing' (default)
				if ( jQuery.isArray( val ) ) {
					easing = val[1];
					val = val[0];
				} else {
					easing = opt.specialEasing && opt.specialEasing[p] || opt.easing || 'swing';
				}
				opt.animatedProperties[p] = easing;

				// TRANSITION++
				// prevent transition when a special easing is supplied
				transition = supportTransition ?
					// we could use a hash to convert the names
					easing == 'swing' ? 'ease':
					easing == 'linear' ? easing:
					false;

				// collect the properties to be added to elem.style.transition...
				if ( transition ) {
					hook = cssHooks[p];
					transition =
						// convert property name to the appropriate vendor prefixed property name if necessary
						(hook && hook.affectedProperty ? hook.affectedProperty.replace(/([A-Z]|^ms)/g, '-$1').toLowerCase() : p) +" "+
						opt.duration +"ms "+
						transition;

					// Add as much duration as properties, to be able to add different durations when queue option is false
					transitions.push(transition)

					opt.transition[p] = true;
				}
			}

			if ( opt.overflow != null ) {
				thisStyle.overflow = "hidden";
			}

			// TRANSITION++
			if ( supportTransition && transitions.length ) {
				thisStyle[transition.name] = transitions.join() + queue ?
					'':
					// values should be concatenated to the previous one if the animation is not being queued
					',' + thisStyle[transition.name];

				props = jQuery.data( self, 'transition', undefined, true);

				if ( !props ) {
					props = {};
					jQuery.data( self, 'transition', props, true);
				}
			}

			for ( p in prop ) {
				e = new fx( self, opt, p );

				val = prop[p];

				if ( rfxtypes.test(val) ) {
					e[ val === "toggle" ? hidden ? "show" : "hide" : val ]( startTime );

				} else {
					parts = rfxnum.exec(val);
					start = e.cur() || 0;

					if ( parts ) {
						end = parseFloat( parts[2] );
						unit = parts[3] || ( jQuery.cssNumber[ name ] ? "" : "px" );

						// We need to compute starting value
						if ( unit !== "px" ) {
							style( self, p, (end || 1) + unit);
							start = ((end || 1) / e.cur()) * start;
							style( self, p, start + unit);
						}

						// If a +=/-= token was provided, we're doing a relative animation
						if ( parts[1] ) {
							end = ((parts[1] === "-=" ? -1 : 1) * end) + start;
						}

						e.custom( startTime, start, end, unit );

					} else {
						e.custom( startTime, start, val, "" );
					}
				}
				// TRANSITION++
				// collects fx objects to use fx.step( gotoEnd ) on transitionEnd
				if ( opt.transition[p] ) {
					// the rotate.js cssHooks affects the transform property.
					// the developer needs to tell us, so that we can detect the transition end of that hook.
					// he/she will also take care of browser normalization.
					// note: this breaks if different hooks affect the same property, but this is unlikely to happen
					hook = cssHooks[name];
					// affectedProperty could also be named "targetProp", "transitionEquivalent", or anything, really.
					props[hook && hook.affectedProperty || name] = e;
				}
			}

			// For JS strict compliance
			return true;
		});
	},

	stop: function( clearQueue, gotoEnd ) {
		if ( clearQueue ) {
			this.queue([]);
		}

		this.each(function() {
			var timers = jQuery.timers,
				i = timers.length;
			// go in reverse order so anything added to the queue during the loop is ignored
			while ( i-- ) {
				if ( timers[i].elem === this ) {
					if (gotoEnd) {
						// force the next step to be the last
						timers[i](true);
					}

					timers.splice(i, 1);
				}
			}
		});

		// start the next in the queue if the last step wasn't forced
		if ( !gotoEnd ) {
			this.dequeue();
		}

		return this;
	}

});

function genFx( type, num ) {
	var obj = {};

	jQuery.each( fxAttrs.concat.apply([], fxAttrs.slice(0,num)), function() {
		obj[ this ] = type;
	});

	return obj;
}

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show", 1),
	slideUp: genFx("hide", 1),
	slideToggle: genFx("toggle", 1),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.extend({
	speed: function( speed, easing, fn ) {
		var opt = speed && typeof speed === "object" ? jQuery.extend({}, speed) : {
			complete: fn || !fn && easing ||
				jQuery.isFunction( speed ) && speed,
			duration: speed,
			easing: fn && easing || easing && !jQuery.isFunction(easing) && easing
		},
		fx = jQuery.fx;

		opt.duration = fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
			opt.duration in fx.speeds ? fx.speeds[opt.duration] : fx.speeds._default;

		// Queueing
		opt.old = opt.complete;
		opt.complete = function() {
			if ( opt.queue !== false ) {
				jQuery(this).dequeue();
			}
			if ( jQuery.isFunction( opt.old ) ) {
				opt.old.call( this );
			}
		};

		return opt;
	},

	easing: {
		linear: function( p, n, firstNum, diff ) {
			return firstNum + diff * p;
		},
		swing: function( p, n, firstNum, diff ) {
			return ((-Math.cos(p*Math.PI)/2) + 0.5) * diff + firstNum;
		}
	},

	timers: [],

	fx: function( elem, options, prop ) {
		this.options = options;
		this.elem = elem;
		this.prop = prop;

		options.orig = options.orig || {};
	}

});

jQuery.fx.prototype = {
	// Simple function for setting a style value
	update: function() {
		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		(jQuery.fx.step[this.prop] || jQuery.fx.step._default)( this );
	},

	// Get the current size
	cur: function() {
		var elem = this.elem,
			prop = this.prop,
			r,
			parsed;
		if ( elem[prop] != null && (!elem.style || elem.style[prop] == null) ) {
			return elem[ prop ];
		}

		r = jQuery.css( elem, prop );
		// Empty strings, null, undefined and "auto" are converted to 0,
		// complex values such as "rotate(1rad)" are returned as is,
		// simple values such as "10px" are parsed to Float.
		return isNaN( parsed = parseFloat( r ) ) ? !r || r === "auto" ? 0 : r : parsed;
	},

	// Start an animation from one number to another
	custom: function( startTime, from, to, unit ) {
		var self = this,
			fx = jQuery.fx;

		self.startTime = startTime;
		self.start = from;
		self.end = to;
		self.unit = unit || self.unit || ( jQuery.cssNumber[ self.prop ] ? "" : "px" );
		self.now = self.start;
		self.pos = self.state = 0;

		function t( gotoEnd, now ) {
			return self.step( gotoEnd, now );
		}

		t.elem = self.elem;

		if ( self.options.transition[prop] ) {
			jQuery.style(self.elem, self.prop, to + unit);

		} else if ( t( false, startTime ) && jQuery.timers.push(t) && !timerId ) {
			timerId = setInterval(fx.tick, fx.interval);
		}
	},

	// Simple 'show' function
	show: function( startTime ) {
		// Remember where we started, so that we can go back to it later
		this.options.orig[this.prop] = jQuery.style( this.elem, this.prop );
		this.options.show = true;

		// Begin the animation
		// Make sure that we start at a small width/height to avoid any
		// flash of content
		this.custom( startTime, this.prop === "width" || this.prop === "height" ? 1 : 0, this.cur() );

		// Start by showing the element
		jQuery( this.elem ).show();
	},

	// Simple 'hide' function
	hide: function( startTime ) {
		// Remember where we started, so that we can go back to it later
		this.options.orig[this.prop] = jQuery.style( this.elem, this.prop );
		this.options.hide = true;

		// Begin the animation
		this.custom( startTime, this.cur(), 0 );
	},

	// Each step of an animation
	step: function( gotoEnd, t ) {
		var done = true,
			elem = this.elem,
			options = this.options,
			duration = options.duration,
			transition = options.transition[this.prop],
			supportTransition
			i, p, style;

		if ( transition || gotoEnd || t >= duration + this.startTime ) {
			if ( !transition ) {
				this.now = this.end;
				this.pos = this.state = 1;
				this.update();

			// Stop a transition halfway through
    	} else if ( !gotoEnd ) {
				if ( hook = jQuery.cssHooks[prop] ) {
		    	prop = hook.affectedProperty || prop;
		    }
		    // yes, stoping a transition halfway through should be as simple as setting a property to its current value.
		    // Try to call window.getComputedStyle() only once per element (in tick()?)
		    this.elem.style[prop] = window.getComputedStyle(this.elem)[prop];
			}

			options.animatedProperties[ this.prop ] = true;

			for ( i in options.animatedProperties ) {
				if ( options.animatedProperties[i] !== true ) {
					done = false;
				}
			}

			if ( done ) {
				// Reset the overflow
				if ( options.overflow != null && !jQuery.support.shrinkWrapBlocks ) {

					jQuery.each( [ "", "X", "Y" ], function (index, value) {
						elem.style[ "overflow" + value ] = options.overflow[index];
					} );
				}

				// Hide the element if the "hide" operation was done
				if ( options.hide ) {
					jQuery(elem).hide();
				}

				// Reset the properties, if the item has been hidden or shown
				if ( options.hide || options.show ) {
					style = jQuery.style;
					for ( p in options.animatedProperties ) {
						style( elem, p, options.orig[p] );
					}
				}

				// TRANSITION++
		    if ( transition ) {
		    	supportTransition = jQuery.support.transition;
		    	this.elem.style[supportTransition.name + 'Duration'] = '0';
		    	this.elem.style[supportTransition.name + 'Property'] = 'none';
		    	jQuery.event.remove( this.elem, supportTransition.end +'.animate' );
		    }

				// Execute the complete function
				options.complete.call( elem );
			}

			return false;

		} else {
			// classical easing cannot be used with an Infinity duration
			if (duration == Infinity) {
				this.now = t;
			} else {
				var n = t - this.startTime;

				this.state = n / duration;
				// Perform the easing function, defaults to swing
				this.pos = jQuery.easing[options.animatedProperties[this.prop]](this.state, n, 0, 1, duration);
				this.now = this.start + ((this.end - this.start) * this.pos);
			}
			// Perform the next step of the animation
			this.update();
		}

		return true;
	}
};

jQuery.extend( jQuery.fx, {
	tick: function() {
		var timers = jQuery.timers,
			i = 0,
			now = jQuery.now();

		// don't cache timers.length since it might change at any time.
		for ( ; i < timers.length; i++ ) {
			if ( !timers[i]( false, now ) ) {
				timers.splice(i--, 1);
			}
		}

		if ( !timers.length ) {
			jQuery.fx.stop();
		}
	},

	interval: 13,

	stop: function() {
		clearInterval( timerId );
		timerId = null;
	},

	speeds: {
		slow: 600,
		fast: 200,
		// Default speed
		_default: 400
	},

	step: {
		opacity: function( fx ) {
			jQuery.style( fx.elem, "opacity", fx.now );
		},

		_default: function( fx ) {
			if ( fx.elem.style && fx.elem.style[ fx.prop ] != null ) {
				fx.elem.style[ fx.prop ] = (fx.prop === "width" || fx.prop === "height" ? Math.max(0, fx.now) : fx.now) + fx.unit;
			} else {
				fx.elem[ fx.prop ] = fx.now;
			}
		}
	}
});

if ( jQuery.expr && jQuery.expr.filters ) {
	jQuery.expr.filters.animated = function( elem ) {
		return jQuery.grep(jQuery.timers, function( fn ) {
			return elem === fn.elem;
		}).length;
	};
}

function defaultDisplay( nodeName ) {
	var stylesheets = document.styleSheets,
			disabled = [],
			elem, display, style, idx;

	if ( !elemdisplay[ nodeName ] ) {

		// #8099 - If the end-dev has globally changed a default
		// display, we can temporarily disable their styles to check
		// for the correct default value
		for ( idx = 0; idx < stylesheets.length; ++idx  ) {
			style = stylesheets[ idx ];
			disabled[ idx ] = style.disabled;
			style.disabled = true;
		}

		// To accurately check an element's default display value,
		// create a temp element and check it's default display, this
		// will ensure that the value returned is not a user-tampered
		// value.
		elem = jQuery("<" + nodeName + ">").appendTo("body");
		display = elem.css("display");

		// Remove temp element
		elem.remove();

		if ( display === "none" || display === "" ) {
			display = "block";
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;

		// Restore stylesheets
		for ( idx = 0; idx < stylesheets.length; ++idx  ) {
			stylesheets[ idx ].disabled = disabled[ idx ];
		}
	}

	return elemdisplay[ nodeName ];
}

})( jQuery );
