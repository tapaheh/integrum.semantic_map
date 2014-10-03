(function ( $ ) {
    $.fn.semanticMap = function( options ) {
        var settings = $.extend({
            // These are the defaults.
            baseUrl: 'http://monitoring.integrum.ru/',
            xml: false,
            paperMinSize: 400, //минимальный размер SVG елемента по высоте и ширине, меньше которого диаграмма не "сжимается" при уменьшении окна
            paperHeight: 'auto',
            paperWidth: 'auto',
            transSpeed: 200,
            animation: false, //плавное выделение/затухание элемента
            linkOpacity: 0.5,
            linkColor: '#ccc',
            linkOpacityActive:1,
            linkFadeSpeed:300,
            maxLinkWidth: 12,
            elementRadius: 33,
            image:'./img/ico_abstract.png',
            image2:'./img/ico_person.png'
        }, options );

        if ( ! settings.xml) {
            throw new Error('Не задан адрес xml файла');
        }

        var normalStateTimeout = 0;
        var minLinkDocCount = Infinity;
        var maxLinkDocCount = -Infinity;

        var paperWidth = (settings.paperWidth == 'auto') ? ((this.width() < settings.paperMinSize)  ? settings.paperMinSize : this.width())  : settings.paperWidth;
        var paperHeight = settings.paperMinSize;
        if (settings.paperHeight == 'auto') {
            //попробуем установить высоту SVG элемента по высоте родителей
            var parent = this.parent();
            var heightDiff = 5;
            while (parent.height() < settings.paperMinSize && parent.prop('tagName') != 'BODY') {
                heightDiff += parent.outerHeight(true) - parent.height();
                parent = parent.parent();
            }
            paperHeight = parent.innerHeight() < paperHeight ? paperHeight : parent.height()-heightDiff;
        } else {
            paperHeight = settings.paperHeight;
        }

        var center = {x:paperWidth/2, y:paperHeight/2}

        var graph = new joint.dia.Graph;
        var paper = new joint.dia.Paper({
            el: this,
            width: paperWidth,
            height: paperHeight,
            gridSize: 1,
            model: graph
        });

        var  createGraphFromJSON = function(json) {
            var elements = [];
            var links = [];
            var count = 0;
            var eIndex  = 0;


            var radius = paperHeight/2 - settings.elementRadius * 2;

            settings.baseUrl += json.baseUrl;

            if (json.GraphObjects){

                if (json.GraphObjects.GraphObject.length) {
                    count = json.GraphObjects.GraphObject.length;
                } else if(json.GraphObjects.GraphObject) {
                    count = 1;
                }

                var stepDegree = Math.floor(360/count);

                //создаем элементы из json данных
                if(count > 1) {
                    _.each(json.GraphObjects.GraphObject, function(object, parentElementLabel) {
                        var x = Math.cos(g.toRad(eIndex * stepDegree)) * radius + center.x - settings.elementRadius/2;
                        var y = Math.sin(g.toRad(eIndex * stepDegree)) * radius + center.y - settings.elementRadius/2;
                        elements.push(makeElement(object, x, y));
                        eIndex++;
                    });
                } else if (count == 1) {
                    elements.push(makeElement(json.GraphObjects.GraphObject, center.x, center.y/2));
                    eIndex++;
                }

                if (json.GraphLinks){
                    _.each(json.GraphLinks.GraphLink, function(link) {
                        var docCount = link.documentsCount*1;
                        maxLinkDocCount = maxLinkDocCount < docCount ? docCount : maxLinkDocCount;
                        minLinkDocCount  = minLinkDocCount > docCount ? docCount : minLinkDocCount;
                    });

                    //создаем коннекторы
                    _.each(json.GraphLinks.GraphLink, function(link) {
                        links.push(makeLink(link));
                    });

                    // Links must be added after all the elements. This is because when the links
                    // are added to the graph, link source/target elements must be in the graph already.
                    elements = elements.concat(links);
                }
            }
            return elements;

        }

        var makeLink = function(link) {
            var strokeStep = settings.maxLinkWidth / maxLinkDocCount;
            var strokeWidth = 2 + Math.floor((link.documentsCount * strokeStep));

            var linkElem = new joint.shapes.basic.SemanticLink({
                source: { id: link.fromId },
                target: { id: link.toId },
                labels: [{ attrs: { text: { text: link.documentsCount }}}],
                attrs: {
                    '.connection': { stroke: settings.linkColor, 'stroke-width': strokeWidth, 'opacity':settings.linkOpacity }
                }
            });
            return linkElem;
        }

        var makeElement = function(object, x, y) {
            //максимальная длина строки в имени
            var maxLength = 22;

            //разбиваем имя на строки
            if (object.name.length > maxLength) {
                object.name = object.name.replace("-"," - ");
                var pieces = object.name.split(/[\s]+/);
                object.name = '';
                var curPos =0;
                for (p in pieces) {
                    if ((curPos + pieces[p].length + 1) <= maxLength) {
                        if (p > 0){
                            object.name += ' ';
                        }
                        object.name += pieces[p];
                        curPos += pieces[p].length + 1;
                    } else {
                        object.name += '\n' + pieces[p];
                        curPos = pieces[p].length + 1;
                    }
                }
            }

            //иконка на элементе диаграммы
            var type = object.type ? object.type : 0;
            var image =  (type == 1) ? settings.image2 : settings.image;

            var lightcolor = shadeColor2('#'+object.color.substr(2), 0.6);

            var el = new joint.shapes.basic.Semantic({
                position: { x: x, y: y },
                fillColor: object.color.substr(2),
                id: object.id,
                attrs: {
                    '.node circle': {fill:'#'+object.color.substr(2)},
                    '.node image': {'xlink:href':image},
                    '.node text.doc-count': {text: object.documentsCount },
                    '.node text.semanticName':{text:object.name}
                }
            });

            el.attr('circle/fill', {
                type: 'linearGradient',
                stops: [
                    { offset: '0%', color: lightcolor },
                    { offset: '100%', color: '#'+object.color.substr(2) }
                ],
                attrs: {x1: '0%', y1: '0%', x2: '0%', y2: '100%'}
            });

            return el;
        }

        var resetTimeout = function(){
            normalStateTimeout = setTimeout(
                function(){
                    _.each(graph.getElements(), function(e, i){
                        elemFade(paper.findViewByModel(e), 1);
                    });
                    _.each(graph.getLinks(), function(e, i){
                        linkFade(paper.findViewByModel(e), settings.linkOpacity, settings.linkColor, false);
                        e.toBack();
                    })
                    normalStateTimeout = 0;
                }, 50);
        }

        var resetTouchcount = function(){
            _.each(graph.getLinks(), function(e, i){
                paper.findViewByModel(e).touchcount = 0;
            })
            _.each(graph.getElements(), function(e, i){
                paper.findViewByModel(e).touchcount = 0;
            })
        }

        var elemFade = function(view, opacity){
            if (settings.animation){
                view.$el.stop().fadeTo(settings.linkFadeSpeed, opacity)
            } else{
                view.$el.css('opacity', opacity)
            }
        }

        var linkFade = function(view, opacity, color, showLabels){
            if (settings.animation){
                view.$el.find('.connection').stop().fadeTo(settings.linkFadeSpeed, opacity)
            } else{
                view.$el.find('.connection').css('opacity', opacity)
            }
            view.$el.find('.connection').attr('stroke', color);
            if (showLabels){
                view.$el.find('.labels').show();
            } else {
                view.$el.find('.labels').hide();
            }
        }

        var shadeColor2 = function (color, percent) {
            var f = parseInt(color.slice(1),16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent*-1 : percent ,R = f>>16,G=f>>8&0x00FF, B = f&0x0000FF;
            return "#"+(0x1000000+(Math.round((t-R)*p)+R)*0x10000+(Math.round((t-G)*p)+G)*0x100+(Math.round((t-B)*p)+B)).toString(16).slice(1);
        }

        joint.shapes.basic.Semantic = joint.shapes.basic.Generic.extend({
            markup: '<g class="node"><circle/><image/><text class="doc-count"/><rect class="semanticName"/><text class="semanticName"/></g>',
            defaults: joint.util.deepSupplement({
                type: 'basic.Semantic',
                attrs: {
                    '.node circle': {r: settings.elementRadius, fill: '#ff8030', opacity:1},
                    '.node image': {'xlink:href':settings.image, 'ref-x': 0.5, 'ref-y': 4, ref: 'g.node circle', width:48, height:29,'y-alignment': 'bottom', 'x-alignment': 'middle'},
                    '.node .doc-count': {'ref-x': 0.5, 'ref-y': 0.6, ref: 'g.node circle', 'y-alignment': 'bottom', 'x-alignment': 'middle'},
                    '.node text.semanticName': {'text-anchor': 'middle', fill:'white', 'ref-x': '0.5', 'ref-y': (settings.elementRadius*2+4), ref: 'g.node circle'}
                }
            }, joint.shapes.basic.Generic.prototype.defaults)
        });

        joint.shapes.basic.SemanticView = joint.dia.ElementView.extend({
            touchcount: 0,
            moved: false,
            events: {
                'mouseover': 'showTooltip',
                'mouseout': resetTimeout,
                'touchstart':'touchHandler',
                'touchend': 'touchendHandler',
                'touchmove':'moveHandler',
                'touchcancel':'downHandler',
                'touchenter':'downHandler',
                'touchleave':'downHandler'
            },
            moveHandler: function(){
                this.moved = true;
            },
            touchendHandler:function(){
                if (this.moved){
                    this.showTooltip();
                }
                this.moved = false;
                return false;
            },
            touchHandler: function(){
                if (this.touchcount > 0) {
                    resetTimeout();
                    resetTouchcount();
                } else {
                    resetTouchcount()
                    this.showTooltip();
                    this.touchcount++;
                }
                //return false;
            },

            downHandler: function() {return false},
            showTooltip: function (ev) {
                var el = this;
                if (normalStateTimeout) {
                    clearTimeout(normalStateTimeout);
                    normalStateTimeout = 0;
                }

                var neighborIds = []
                neighborIds.push(el.model.id);
                _.each(graph.getNeighbors(el.model), function(e, i){
                    neighborIds.push(e.id)
                })

                _.each(graph.getLinks(), function(e, i) {
                    //e.toFront(); - broken in ie
                    var view = paper.findViewByModel(e)
                    if (el.model.id == e.get('source').id  || el.model.id == e.get('target').id ) {
                        view.$el.parent().append(view.$el)
                        linkFade(view, 0.6, '#'+el.model.get('fillColor'), true)
                        view.touchcount = 1;
                    } else {
                        linkFade(view, 0.4, settings.linkColor, false)
                        view.touchcount = 0;
                    }
                });

                _.each(graph.getElements(), function(e, i){
                    var view = paper.findViewByModel(e);
                    if ($.inArray(e.id, neighborIds) == -1) {
                        elemFade(view, 0.2)
                    } else {
                        elemFade(view, 1)
                    }
                })
            }
        })

        joint.shapes.basic.SemanticLink = joint.dia.Link.extend({
            defaults: joint.util.deepSupplement({
                type: 'basic.SemanticLink',
                labels: [{
                    position: .5,
                    attrs: {
                        rect: {opacity:0.9,fill: settings.linkColor,rx:1,ry:1,stroke:'#ccc','stroke-width': 15 },
                        text: {fill: '#222','font-size':11, 'font-weight':'normal', 'font-family': 'Arial, sans-serif'}
                    }
                }]

            }, joint.dia.Link.prototype.defaults)
        });

        joint.shapes.basic.SemanticLinkView = joint.dia.LinkView.extend({
            touchcount: 0,
            events: {
                'mousedown': 'downHandler',
                'mouseover': 'showTooltip',
                'mouseout': resetTimeout,
                'click': 'clickHandler',
                'touchstart':'touchHandler',
                'touchmove':'downHandler',
                'touchend': 'downHandler',
                'touchcancel':resetTimeout,
                'touchenter':'downHandler',
                'touchleave':resetTimeout
            },

            touchHandler: function(){
                if (this.touchcount > 0) {
                    this.clickHandler();
                    resetTimeout();
                    resetTouchcount()
                } else {
                    resetTouchcount()
                    this.showTooltip();
                    this.touchcount++;
                }
                return false;
            },

            downHandler: function() {return false},

            clickHandler: function(){
                resetTimeout();
                var url = settings.baseUrl + '&oid=' + this.model.get('source').id + '&oid2=' + this.model.get('target').id;
                window.open(url,'_blank');
                return false;
            },

            showTooltip: function () {
                var el = this;
                if (normalStateTimeout) {
                    clearTimeout(normalStateTimeout);
                    normalStateTimeout = false;
                }
                _.each(graph.getLinks(), function(e, i){
                    var view = paper.findViewByModel(e)
                    if (view.id == el.id){
                        view.$el.parent().append(view.$el)
                        linkFade(view, 1, '#99c', true);
                    } else {
                        linkFade(view, settings.linkOpacity, settings.linkColor, false);
                    }

                    _.each(graph.getElements(), function(e, i){
                        var view = paper.findViewByModel(e);
                        if (el.model.get('source').id == e.id || el.model.get('target').id == e.id){
                            elemFade(view, 1)
                        } else {
                            elemFade(view, 0.2)
                        }
                    })
                });
                return false;
            }
        });

        var canvasSelector  = this.selector;
        var currentScale =1;
        var nodeScale = 1;

        $.get(settings.xml, function (xml) {
            var jsonObj = $.xml2json(xml);
            var cells = createGraphFromJSON(jsonObj);
            graph.resetCells(cells);
            _.each(graph.getLinks(), function(e, i){
                var view = paper.findViewByModel(e);
                view.$el.find('.labels').hide();
                e.toBack();
            })

            _.each(graph.getElements(), function(e, i){
                var view = paper.findViewByModel(e)
                view.$el.find('text.semanticName tspan').each(
                    function(i,e){
                        e.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space","preserve")
                })
            })

            if (graph.getElements().length > 15){
                nodeScale = 0.75
            } else if (graph.getElements().length > 12) {
                nodeScale = 0.85
            }
            $('.element.basic.Semantic .node').attr({'transform':' scale('+nodeScale+')'});
            $(canvasSelector).mousewheel(function(event) {
                var newScale = currentScale + event.deltaY/10;
                if (newScale >= 0.5 && newScale <= 1.5) {
                    currentScale = newScale;
                    $('.viewport').attr({'transform':'matrix('+(currentScale)+', 0, 0, '+currentScale+', '+(center.x-currentScale*center.x)+', '+(center.y-currentScale*center.y)+')'})
                }
                return false;
            });
            $(canvasSelector).on({ 'touchend' : function(){
                resetTimeout();
                resetTouchcount();
            }});
        })
        .fail(function() {
            throw new Error('Невозможно открыть файл "'+settings.xml+'"');
        });

    };
}( jQuery ));