/*!
 * civomega jQuery plugin
 */

;(function ( $, window, document, undefined ) {

    // Define plugin defaults
    var pluginName = "civomega",
        defaults = {
            patternUrl: "",    // URL to page which will return matching patterns
            typeUrl: "",       // URL to page which will return entity types
            entityUrl: "",     // URL to page which will return matching entities
            answerUrl: "",     // URL to page which will take a question and return answers
            styleUrl: "",      // URL to dynamic css file
        };

    // The actual plugin constructor
    function Plugin( element, options ) {
        var self = this;
        self.element = element;
        self.options = $.extend( {}, defaults, options) ;

        self._defaults = defaults;
        self._name = pluginName;

        self.typeCache = null;
        self.patternCache = null;
        self.entityCache = null;

        self.lastLetter = 0;           // Used if you need keydown events but also need the character inputted

        self.lockedPattern = null;  // The pattern that is actively being completed
        self.activeEntity = null;   // The the ID of the pattern's entity that is actively being populated
        self.patternSegments = [];  // The pieces of the pattern associated with this question
        self.entityValues = [];     // The values we have collected so far

        self.activeAjax = null;
        self.highlightedIndex = -1;
        self.cursorIndex = -1;

        self.init();
    }

    Plugin.prototype = {

        init: function() {
            var self = this;
            var $el = $(this.element)
                .addClass("civomega");

            // Add interface elements
            self.interface = [];
            self.interface.questionSegments = [];

            // The question container
            var $question = $("<div>")
                .addClass("civomega-question")
                .appendTo($el);
            self.interface.$question = $question;

            // The segment container
            var $questionSegments = $("<div>")
                .addClass("civomega-question-segments")
                .hide()
                .appendTo($question);
            self.interface.$questionSegments = $questionSegments;

            // The actual input for the question
            var $questionInputBase = $("<input>")
                .attr("type","text")
                .addClass("civomega-question-input")
                .addClass("civomega-question-base")
                .keydown(function(e) {
                    return self.processKeydown(e);
                })
                .keyup(function(e) {
                    return self.processKeyup(e);
                })
                .appendTo($question);
            self.interface.$questionInputBase = $questionInputBase;

            // The visual indicator for ajax requests (e.g. spinny wheel)
            var $ajaxStatus = $("<div>")
                .addClass("civomega-ajax-status")
                .hide()
                .appendTo($el);
            self.interface.$ajaxStatus = $ajaxStatus;

            // The list of patterns returned from the server
            var $patternList = $("<ul>")
                .addClass("civomega-patternlist")
                .hide()
                .appendTo($el);
            self.interface.$patternList = $patternList;

            // The list of entities returned from the server
            var $entityList = $("<ul>")
                .addClass("civomega-entitylist")
                .hide()
                .appendTo($el);
            self.interface.$entityList = $entityList;

            // The list of answers returned from the server
            var $answerList = $("<ul>")
                .addClass("civomega-answerlist")
                .hide()
                .appendTo($el);
            self.interface.$answerList = $answerList;

            // Load in our registered entity types
            self.activeAjax = $.ajax({
                method: "GET",
                url: self.options.typeUrl,
                dataType: "json",
            })
            .done(function( data ) {
                self.typeCache = data.types;
                self.redraw();
            });

            // Load in our dynamic css
            $('head').append('<link rel="stylesheet" href="' + self.options.styleUrl + '" type="text/css" />');
        },

        processKeydown: function(e) {
            var self = this;
            self.lastLetter = String.fromCharCode(e.keyCode);
            self.lastLetter = e.shiftKey?self.lastLetter:self.lastLetter.toLowerCase();
            self.lastLetter = (self.lastLetter.match(/[a-zA-Z ]/)?self.lastLetter:"");

            switch(e.keyCode) {

                case 13: // enter
                    // If we are in the pattern list, enter locks the currently highlighted pattern
                    if(self.isPatternList() && self.highlightedIndex != -1) {
                        self.lockPattern(self.patternCache[self.highlightedIndex]);
                        self.redraw();
                        return false;
                    }
                    break;

                case 8: // delete
                    // If we are in the pattern list, delete unhighlights the currently highlighted pattern
                    if(self.isPatternList()) {
                        self.highlightedIndex = -1;
                        self.redraw();
                    } else {
                        if(getCursorPosition() == 0)
                            self.cancelPattern();
                    }
                    break;

                case 27: // escape

                    // If we are in the pattern list, escape unhighlights the currently highlighted pattern
                    if(self.isPatternList()) {
                        self.highlightedIndex = -1;
                        self.redraw();
                        return false;
                    } else {
                        self.cancelPattern()
                    }
                    break;

                case 37: // left

                    // If we are in the pattern list, left unhighlights the currently highlighted pattern
                    if(self.isPatternList() && self.highlightedIndex != -1) {
                        self.highlightedIndex = -1;
                        self.redraw();
                        return false;
                    } else {
                        self.redraw();
                    }
                    break;

                case 38: // up
                    if(self.isPatternList()) {
                        self.highlightedIndex--;
                        self.highlightedIndex = Math.max(self.highlightedIndex, -1);
                        self.redraw();
                        return false;
                    }
                    break;

                case 39: // right
                    // If we are in the pattern list, enter locks the currently highlighted pattern
                    if(self.isPatternList() && self.highlightedIndex != -1) {
                        self.lockPattern(self.patternCache[self.highlightedIndex]);
                        self.redraw();
                        return false;
                    } else {
                        self.redraw();
                    }
                    break;

                case 40: // down
                    if(self.isPatternList()) {
                        self.highlightedIndex++;
                        self.highlightedIndex = Math.min(self.highlightedIndex, self.patternCache.length - 1);
                        self.redraw();
                        return false;
                    }
                    break;
                default:
                    if(self.isPatternLocked())
                        self.redraw();
                    break;
            }
        },

        processKeyup: function(e) {
            var self = this;
            switch(e.keyCode) {
                case 13: // enter
                    break;
                case 27: // escape
                    break;
                case 37: // left
                    break;
                case 38: // up
                    break;
                case 39: // right
                    break;
                case 40: // down
                    break;
                default:
                    if(!self.isPatternLocked())
                        self.refreshPatterns();
                    break;
            }
        },

        refreshPatterns: function() {
            var self = this;
            var text = self.interface.$questionInputBase.val();

            if(text == "") {
                self.patternCache = null;
                self.redraw();
            } else {
                // Look up any matching patterns
                self.activeAjax = $.ajax({
                    method: "GET",
                    url: self.options.patternUrl,
                    dataType: "json",
                    data: {
                        text: text
                    }
                })
                .done(function( data ) {
                    self.patternCache = data.patterns;
                    self.highlightedIndex = -1;
                    self.activeAjax = null;
                    self.redraw();
                })
                self.redraw();
            }
        },

        lockPattern: function(pattern) {
            // Select this pattern as the one we want to use
            var self = this;
            self.lockedPattern = pattern;

            // Figure out what buckets we want to populate
            self.patternSegments = self.parsePattern(pattern);

            // Clear out the old forms
            self.interface.$questionSegments.children().remove();


            // Create inputs for each entity
            var totalWidth = 0;
            for(var x in self.patternSegments) {
                var segment = self.patternSegments[x];
                if(segment.type == "text") {
                    var $segmentElement = $("<div>")
                        .addClass("civomega-question-segment")
                        .addClass("civomega-question-segment-text")
                        .text(segment.value)
                        .appendTo(self.interface.$questionSegments);
                    self.interface.questionSegments[x] = $segmentElement;
                } else {
                    var $segmentElement = $("<input>")
                        .attr("type","text")
                        .addClass("civomega-question-input")
                        .addClass("civomega-question-segment")
                        .addClass("civomega-question-segment-input")
                        .addClass("civomega-entity-" + segment.value.code)
                        .keydown(function(e) {
                            return self.processKeydown(e);
                        })
                        .keyup(function(e) {
                            return self.processKeyup(e);
                        })
                        .appendTo(self.interface.$questionSegments);
                    self.interface.questionSegments[x] = $segmentElement;
                }
                self.interface.$questionSegments.width(totalWidth);
            }
        },

        cancelPattern: function() {
            // Undo the current pattern
            var self = this;
            self.lockedPattern = null;
        },

        activateEntity: function(entity) {
            var self = this;
        },

        cancelEntity: function() {
            var self = this;
        },

        completeEntity: function() {
            var self = this;
        },

        editEntity: function(index) {
            var self = this;
        },

        isPatternList: function() {
            // Returns true if the user has a pattern cache but hasn't picked a pattern
            var self = this;
            return !self.isPatternLocked() && self.patternCache != null;
        },

        isPatternLocked: function() {
            // Returns true if the user has locked in a pattern
            var self = this;
            return self.lockedPattern != null;
        },

        isEntityList: function() {
            // Returns true if the user has a pattern cache but hasn't picked a pattern
            var self = this;
            return self.isEntityInput() && self.entityCache != null;
        },
        isEntityInput: function() {
            // Returns true if the user is currently entering an entity
            var self = this;
            return self.activeEntity != null;
        },

        renderPattern: function(pattern) {
            // Takes a pattern string and returns an HTML string
            var self = this;
            var breakdown = pattern.split(/(\{[^\}]*\})/);
            var html = "";
            for(var x in breakdown) {
                var item = breakdown[x];
                if(item.match(/^\{[^\}]*\}$/)) {
                    // This is an entity
                    var typeCode = item.substring(1,item.length-1);

                    var type = {
                        "display_name": typeCode,
                        "validation": "/(.)*/",
                        "description": ""
                    }
                    if(typeCode in self.typeCache)
                        var type = self.typeCache[typeCode];
                    
                    html += "<div class='civomega-entity-" + type.code + " civomega-entity'>" + type.display_name +"</div>";

                } else {
                    // This is just text
                    html += item;
                }
            }
            return html;
        },

        parsePattern: function(pattern) {
            // Takes a pattern string and returns a segment array
            var self = this;
            var breakdown = pattern.split(/(\{[^\}]*\})/);
            var segments = [];
            for(var x in breakdown) {
                var item = breakdown[x];
                if(item.match(/^\{[^\}]*\}$/)) {
                    // This is an entity
                    var typeCode = item.substring(1,item.length-1);

                    var type = {
                        code: typeCode,
                        display_name: typeCode,
                        validation: "/(.)*/",
                        description: ""
                    }
                    if(typeCode in self.typeCache)
                        var type = self.typeCache[typeCode];
                    
                    segments.push({
                        type: "entity",
                        value: type
                    });
                } else {
                    // This is just text
                    segments.push({
                        type: "text",
                        value: item
                    });
                    continue;
                }
            }
            return segments;
        },

        redraw: function() {
            var self = this;

            // Should we render the AJAX loader?
            if(self.activeAjax) {
                self.interface.$ajaxStatus.show();
            } else {
                self.interface.$ajaxStatus.hide();
            }

            // Should we render the pattern autocomplete?
            if(self.isPatternList()) {
                self.redraw_patterns();
                self.interface.$patternList.slideDown(200);
            } else {
                self.interface.$patternList.slideUp(200);
            }

            // Should we render the entity autocomplete?
            if(self.isEntityList()) {
                self.redraw_entities();
                self.interface.$entityList.slideDown(200);
            } else {
                self.interface.$entityList.slideUp(200);
            }

            // Should we replace the current text?
            if(self.isPatternLocked()) {
                self.interface.$questionInputBase.hide();
                self.interface.$questionSegments.show();
                self.redraw_question();
            } else {
                self.interface.$questionSegments.hide();
                self.interface.$questionInputBase.show();
                self.interface.$questionInputBase.focus();
            }
        },

        redraw_question: function() {
            var self = this;
            if(self.isPatternLocked()) {

                // Set the input field widths to match their content
                self.interface.$questionSegments.children("input").each( function(){
                    var $this = $(this);
                    var contentWidth = getContentWidth(this, $this.val() + ($this.is(":focus")?self.lastLetter:""));
                    $this.width(contentWidth);
                });

                // Set the segment container field width to match the content
                var totalWidth = 0;
                self.interface.$questionSegments.children().each( function() {
                    totalWidth += $(this).outerWidth();
                });
                self.interface.$questionSegments.width( totalWidth);

                // Ensure that the cursor is never further than "centered"
                var cursorPosition = getCursorPosition() + 1; // This is called before the cursor is updated
                var text = $(document.activeElement).val() + self.lastLetter;
                var cursorLeftOffset = getContentWidth(document.activeElement, text.substring(0, cursorPosition)) + $(document.activeElement).position().left;

                // Position the cursor relative to the parent
                var centered = cursorLeftOffset - self.interface.$question.width() / 2;
                position = Math.min(self.interface.$questionSegments.width() - self.interface.$question.width(), centered); // Don't have the right appear before the right
                position = Math.max(0, position); // Dont have the left appear after the left
                self.interface.$questionSegments.css("left", -position);
            } else {
            }
        },

        redraw_patterns: function() {
            // We want to re-render the pattern list
            var self = this;

            self.interface.$patternList.empty();
            for(var x in self.patternCache) {
                var pattern = self.patternCache[x];

                var $li = $("<li>")
                    .html(self.renderPattern(pattern))
                    .data("civomega-pattern", pattern)
                    .click(function() {
                        // The user wants to lock into this question
                        self.lockPattern($(this).data("civomega-pattern"));
                        self.redraw();
                    })
                    .mouseenter(function() {
                        // If the mouse entered an unihlighted item, highlight it
                        var index = $(this).index();
                        if(self.highlightedIndex != index) {
                            self.highlightedIndex = index;
                            self.redraw();
                        }
                    })
                    .appendTo(self.interface.$patternList);
                if(x == self.highlightedIndex)
                    $li.addClass("active");
            }
        },

        redraw_entities: function() {
            // We want to re-render the entity list
            var self = this;
        }
    };

    // A really lightweight plugin wrapper around the constructor,
    // preventing against multiple instantiations
    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if (!$.data(this, "plugin_" + pluginName)) {
                $.data(this, "plugin_" + pluginName,
                new Plugin( this, options ));
            }
        });
    };


    // Helper Methods
    function getCursorPosition() {
        var input = document.activeElement;
        if ('selectionStart' in input) {
            // Standard-compliant browsers
            return input.selectionStart;
        } else if (document.selection) {
            // IE
            input.focus();
            var sel = document.selection.createRange();
            var selLen = document.selection.createRange().text.length;
            sel.moveStart('character', -input.value.length);
            return sel.text.length - selLen;
        }
    }
    function getContentWidth(element, text) {
        var $element = $(element);
        var width = 0;
        var $temp = $("<span>")
            .css("font-size", $element.css("font-size"))
            .css("font-weight", $element.css("font-weight"))
            .css("font-family", $element.css("font-family"))
            .css("whitespace", "pre")
            .text(text)
            .insertBefore($element);
        width = $temp.width();
        $temp.remove();
        return width;
    }

})( jQuery, window, document );
