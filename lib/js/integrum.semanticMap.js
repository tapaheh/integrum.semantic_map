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
            while (parent.height() < settings.paperMinSize && parent.prop('tagName') != 'BODY') {
                parent = parent.parent();
            }
            paperHeight = parent.height() < paperHeight ? paperHeight : parent.height()-5;
        } else {
            paperHeight = settings.paperHeight;
        }

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
            var count  = json.GraphObjects.GraphObject.length;

            var stepDegree = Math.floor(360/count);
            var center = {x:paperWidth/2, y:paperHeight/2}
            var radius = paperHeight/2 - settings.elementRadius * 2;
            var eIndex = 0;

            settings.baseUrl += json.baseUrl;

            //создаем элементы из json данных
            _.each(json.GraphObjects.GraphObject, function(object, parentElementLabel) {
                var x = Math.cos(g.toRad(eIndex * stepDegree)) * radius + center.x - settings.elementRadius/2;
                var y = Math.sin(g.toRad(eIndex * stepDegree)) * radius + center.y - settings.elementRadius/2;
                elements.push(makeElement(object, x, y));
                eIndex++;
            });

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
            return elements.concat(links);
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

            //иконка на элементе диаграммы, пока простая проверка -
            // если цвет элемента синий, ставим пиктограмму человека, вместо стандартной абстрактной
            var image =  object.color.substr(2) == '6600FF' ? settings.image2 : settings.image;
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
            highlighted: false,
            events: {
                'touchstart':'showTooltip',
                'touchend': resetTimeout,
                'mouseover': 'showTooltip',
                'mouseout': resetTimeout
            },

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
                    } else {
                        linkFade(view, 0.4, settings.linkColor, false)
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

                this.highlighted = true;
            }
        })

        joint.shapes.basic.SemanticLink = joint.dia.Link.extend({
            defaults: joint.util.deepSupplement({
                type: 'basic.SemanticLink',
                labels: [{ position: .5, attrs: {'rect': {opacity:0.9, fill: settings.linkColor, rx:5, ry:5, stroke:'none', 'stroke-width': 0}, text: { fill: '#222', 'font-size':11, 'font-weight':'normal', 'font-family': 'Arial, sans-serif' , 'ref-x': 0.5, 'ref-y': 0.6, ref: '.label rect', 'y-alignment': 'bottom', 'x-alignment': 'middle'} }}]

            }, joint.dia.Link.prototype.defaults)
        });

        joint.shapes.basic.SemanticLinkView = joint.dia.LinkView.extend({
            events: {
                'mousedown': 'downHandler',
                'touchstart':'showTooltip',
                'touchend': resetTimeout,
                'mouseover': 'showTooltip',
                'mouseout': resetTimeout,
                'click': 'clickHandler'
            },

            downHandler: function(){return false},

            clickHandler: function(){
                var url = settings.baseUrl + '&oid=' + this.model.get('source').id + '&oid2=' + this.model.get('target').id;
                window.open(url,'_blank');
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
            }
        });

        var canvasSelector  = this.selector;
        var currentScale = 1;

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

            //это единственный способ выставить width, height в элементе .label rect
            $('.label rect').attr({'width':40, height:'1.3em', x:-20, y:'-0.35em'})

            if (graph.getElements().length > 15){
                currentScale = 0.75
            } else if (graph.getElements().length > 12) {
                currentScale = 0.85
            }
            $('.element.basic.Semantic .node').attr({'transform':' scale('+currentScale+')'})
            $(canvasSelector).mousewheel(function(event) {
                var newScale = currentScale + event.deltaY/10;
                if (newScale >= 0.6 && newScale <= 1) {
                    currentScale = newScale;
                    $('.element.basic.Semantic .node').attr({'transform':' scale('+currentScale+')'})
                }
                return false;
            });
        })
        .fail(function() {
            throw new Error('Невозможно открыть файл "'+settings.xml+'"');
        });

    };
}( jQuery ));