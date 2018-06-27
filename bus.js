angular.module('App', ['ngSanitize']).controller('BusController', ['$scope', '$http', '$interval', '$q', function ($scope, $http, $interval, $q) {

  $scope.stopId = 41220;
  $scope.presetStopIds = [41354,41220];
  $scope.hiddenRouteTags = '42O';
  $scope.minutesToShow = 15;
  $scope.refreshInterval = 15;
  $scope.nextRefresh = 0;
  $scope.map = new GMaps({div: '#map'   });


  $scope.setStopId = function(id){
    $scope.stopId = id;

    $scope.refresh();
  }

  $scope.isWithinMinutes = function(){
    return function(p) {
      return p && p.minutes <= $scope.minutesToShow;
    }
  };

  $scope.refresh = function(){
    $scope.nextRefresh = $scope.refreshInterval;

    var busUrl = 'http://webservices.nextbus.com/service/publicJSONFeed?command=predictions&a=stl&stopId=' + $scope.stopId;
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

                $scope.showBusOnMap();

                $scope.loading = false;
              });
            });

  };

  $scope.showBusOnMap = function(){

      var predictions = $scope.allPredictions.filter($scope.isWithinMinutes());
      var markers = [];
      var promises = predictions.map(function(p){
        return $http.get('http://webservices.nextbus.com/service/publicJSONFeed?command=vehicleLocation&a=stl&v='+p.vehicle);
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
      $scope.map.fitZoom();
      console.log('Zoom: ', $scope.map.zoom);
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
