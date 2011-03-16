/*
Copyright (C) <2011> by Amjad Masad <amjad.masad@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

//constructor for ehistory
function EHistory(){}
	
(function ($){
	var MAX = 2147483647;
	EHistory.prototype = {

		doSearch: function(query, options) {//@FIXME make one argument
			var self = this;
			this.settings = {
				'text': '',
				'startTime' : 0,
				'endTime' : Date.now(),
				'maxResults' : MAX,
				'regex': 0
			};
			this.searchText_ = query;
			this.filters_ = [];
			this.resultsByDate = {};
			this.settings.text = (function(){
				var words = query.split(/\s/),
					text = '';

				for (var i=0, parts; i < words.length; i++){
					parts = words[i].split(':');console.log(self.settings[parts[0]]);
					if (Filters[ parts[0] ]){
						self.filters_.push({func: Filters[ parts[0] ], text: parts[1]});
					}else if (/startTime|endTime/.test(parts[0])){
						self.settings[parts[0]] = new Date(parts[1]).getTime();
					}else if(self.settings[parts[0]] !== undefined ){
						self.settings[parts[0]] = parts[1];
					}else{
						text+= parts.join(":");
					}
				}
				return text;
			})();
			var searchSettings = {};
			$.extend(searchSettings, this.settings);
			//delete settings unrelavent to chrome history api
			delete searchSettings['regex'];

			function callBack(results){
				console.time('search');
				self.processResults_(results)
			}
			console.log(this.settings);
			chrome.history.search(searchSettings, callBack);
		},
		
		removeURLsOnOneDay: function (obj){
			var day,nextDay,
				self = this;
			for(var i = 0; i<obj.length; i+=2){
				day = new Date(new Date(obj[i] * 1000).toDateString()).getTime();	
				nextDay = day + 24 * 60 * 60 * 1000;
				for (var j = 0; j < obj[i+1].length; j++){
					chrome.history.getVisits({url:obj[i+1][j]}, function(visits){self.filterAndRemove_(visits,day,nextDay)});
				}
			}
		},

		processResults_: function(results){
			results = this.filterOutResults_(results);
			this.results_ = {};
			this.results_.length_ = results.length;
			var self = this;
			for (var i = 0; i < results.length; i++){
				this.results_[results[i].id] = results[i];
				chrome.history.getVisits({ url: results[i].url },function(visits){
						self.fixAndSendBack_(visits);
				});
			}
				 //to worker send the filteration and gitvisits @ the same time
		},

		filterOutResults_: function(results){
			var results__ = [],
				add;
			for (var i=0; i < results.length; i++)
			{
				add = true;
				for (var j = 0; j < this.filters_.length; j++)
				{
					$.extend(results[i], this.settings);
					methodObject = this.filters_[j];
					if (!methodObject.func(results[i], methodObject.text))
						{
							add = false;
							break;
						}
				}
				if (add)
					results__.push(results[i]);
			}
			return results__;
		},

		fixAndSendBack_: function(visits){
			if (!visits || visits.length < 1) return;
			var historyItem = this.results_[visits[0].id],
				now,date,dif,difInDays,timeStr,dateStr,visitItem,finished,min;
				
			delete this.results_[visits[0].id];
			this.results_.length_--;
			if (!historyItem) return;

		    if (historyItem.title == "") 
				historyItem.title = historyItem.url;

			for(var i = 0; i < visits.length; i++){
				visitItem = visits[i];
				visitItem.time = visitItem.visitTime /1000;
				visitItem.url = historyItem.url;
				visitItem.title = historyItem.title;	
				date = new Date(visitItem.visitTime);
				difInDays = Math.floor( (Date.now() - date.getTime()) / 1000 / 60 / 60 / 24);
				timeStr = String(date.getHours() % 12);
				dateStr = "";
				if (timeStr.length < 2)
					timeStr = "0" + timeStr;
				min = String(date.getMinutes());
				timeStr += ":" + (min.length < 2 ? "0" + min : min); 
				timeStr += date.getHours() > 11 ? " P.M" : " A.M";
				//if (difInDays == 0) dateStr += "Today - ";
				//if (difInDays == 1) dateStr += "Yesterday - ";
				dateStr += date.toDateString();

				visitItem.dateRelativeDay = dateStr;
				visitItem.dateTimeOfDay = timeStr;
				visitItem.dateShort = date.toDateString();
				if (!this.resultsByDate[visitItem.dateRelativeDay]){
					this.resultsByDate[visitItem.dateRelativeDay] = {};
				}				
				this.resultsByDate[visitItem.dateRelativeDay][historyItem.id] = visitItem;
			}

			if (this.results_.length_ == 0) this.sendBack_();
				
			finished = this.results_.length_ == 0 ? true : false;

		},
		sendBack_: function(){
			var finalResults = [];
			function getDate(x){
				new Date(x).getTime();
			}
			for (var i in this.resultsByDate){
				for(var j in this.resultsByDate[i])
				{
					//filter out out of date range visits
					if (this.resultsByDate[i][j].visitTime > this.settings.endTime || this.resultsByDate[i][j].visitTime < this.settings.startTime) continue;
					finalResults.push(this.resultsByDate[i][j]);
				}
			}
			finalResults.sort(function (a,b){
				return (a.visitTime === b.visitTime) ? 0 : (a.visitTime < b.visitTime) ? 1 : -1;
			});
			finalResults;
			console.timeEnd('search');
			historyResult({term: this.searchText_, finished: true}, finalResults);
		},

		filterAndRemove_: function(visits, day, next){
			for (var i = 0, time; i < visits.length; i++){
				time = visits[i].visitTime;
				if (time > day && time < next){
					//a hack to delete one item, unless one can visit multiple urls in the same .1 milliseconds
					//chrome history system does not know any less.
					chrome.history.deleteRange({
						startTime: time-0.1,
						endTime: time+ 0.1
					}, $.noop);
				}
			}
			deleteComplete();
		}
	};
	//utils
	function trim(str){
		return str.replace(/^\s+|\s+$/g,'');
	}

	function parseUrl(url){
	      url = url.replace(/http(s)*:\/\//, "").replace(/:[0-9]+/,'');
	      hostName = url.split("/")[0];
	      path = url.replace(hostName+"/", "");
	      return {'hostName' : hostName, 'path' : path};	
	}
	function isValidRegex(regex) {
		var ret;
		try {
			ret = new RegExp(regex);
		} catch (e) {
			return false;
		}
		return ret;
	}
	var Filters = {
		//@todo think about upper/lower case
		'intitle': function(obj, txtMatch){
			var regex = obj.regex && obj.regex == "1" && isValidRegex(txtMatch);
			if (regex){
				return regex.test(obj.title);
			}else{
				return (obj.title.toLowerCase().indexOf(txtMatch.toLowerCase()) > -1);
			}	
		},
		'inurl': function(obj, txtMatch){
			var regex = obj.regex && obj.regex == "1" && isValidRegex(txtMatch);
			if (regex){
				return (new RegExp(txtMatch)).test(obj.url);
			}else{
				return (obj.url.toLowerCase().indexOf(txtMatch.toLowerCase()) > -1);
			}
		},
		'site' : function(obj, host){
			var hostName = parseUrl(obj.url).hostName.split("."),
				//handle stuff like site:.jo or ..jo
				host = $.map(host.split("."), function(v){return v || undefined;}),
				//j is where to start comparing in the hostname of the url in question
				j = hostName.length - host.length;
			for(var i=0; i < host.length; i++)
			{	  
				//if j is undefined or doesn't equal the hostname to match return false 
				if (!hostName[j] || hostName[j].toLowerCase() != host[i].toLowerCase())
					return false;
				j++;
			}
			return true;
		}
	};
})( jQuery );
