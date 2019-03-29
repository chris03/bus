var app = angular.module('App', ['ngSanitize']);

app.factory('debounce', function ($timeout) {
  return function (callback, interval) {
   var timeout = null;
   return function (args) {
     $timeout.cancel(timeout);
     timeout = $timeout(function () {
       callback.apply(this, args);
     }, interval);
    };
  };
});

app.controller('BusController', ['$scope', '$http', '$interval', '$q', 'debounce', function ($scope, $http, $interval, $q, $debounce) {

  $scope.stopId = 41220;
  $scope.presetStopIds = [41354,41220];
  $scope.hiddenRouteTags = '42O';
  $scope.minutesToShow = 15;
  $scope.refreshInterval = 15;
  $scope.nextRefresh = 0;
  $scope.map = new GMaps({div: '#map'   });
  $scope.isZoomed = false;


  $scope.setStopId = function(id){
    $scope.stopId = id;

    $scope.refresh();
  }

  $scope.isWithinMinutes = function(){
    return function(p) {
      return p && p.minutes <= $scope.minutesToShow;
    }
  };

  $scope.refreshNow = function(){
    $scope.nextRefresh = $scope.refreshInterval;

    var busUrl = '/webservicesNextbus?command=predictions&a=stl&stopId=' + $scope.stopId;
            $http({ url: busUrl }).then(function (result) {
              $scope.data = result.data;
              $scope.allPredictions = [];
              $scope.loading = true;

              // Extract all predictions
              $scope.data.predictions.forEach(function(p){

                // Skip routes on match
                if($scope.hiddenRouteTags.indexOf(p.routeTag) >= 0){
                  return;
                }

                if(p.direction){
                 // Fix property not an array when only 1 item
                if(!angular.isArray(p.direction.prediction)){
                  p.direction.prediction = [p.direction.prediction];
                }

                p.direction.prediction.forEach(function(d){
                  $scope.allPredictions.push({
                    route: p.routeTitle,
                    minutes: parseInt(d.minutes),
                    vehicle: d.vehicle
                  });
                });
                }
                $scope.loading = false;
              });

              $scope.showBusOnMap();
            });

  };

  $scope.refresh = $debounce($scope.refreshNow, 500);

  $scope.showBusOnMap = function(){

      var predictions = $scope.allPredictions.filter($scope.isWithinMinutes());
      var markers = [];
      var promises = predictions.map(function(p){
        return $http.get('/webservicesNextbus?command=vehicleLocation&a=stl&v='+p.vehicle);
      });


   $q.all(promises).then(function (ret) {

      $scope.map.removeMarkers();

      ret.forEach(function(v){
        $scope.map.addMarker({
        lat: parseFloat(v.data.vehicle.lat),
        lng: parseFloat(v.data.vehicle.lon),
        title: v.data.vehicle.routeTag
        });
      });

      if(!$scope.isZoomed) {
	$scope.isZoomed = true;
        $scope.map.fitZoom();
        console.log('Zoom: ', $scope.map.zoom);
      }
    });
  };

    $interval(function(){
      if(!$scope.loading){
      $scope.nextRefresh--;
      if($scope.nextRefresh <= 0){
        $scope.refresh();
      }
      };
    }, 1000);
}]);
