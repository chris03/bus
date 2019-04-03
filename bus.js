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

  $scope.config = undefined;
  $scope.presetStopIds = [41354, 41220];

  $scope.allPredictions = [];
  $scope.vehicleLocations = [];

  $scope.refreshInterval = 15;
  $scope.nextRefresh = 0;

  $scope.map = undefined;
  $scope.mapMarkers = [];

  $scope.nextBusApiUrl = '/webservicesNextbus';
  //$scope.nextBusApiUrl = 'http://webservices.nextbus.com/service/publicJSONFeed';

  $scope.loadConfig = function () {
    var jsonConfig = window.localStorage.getItem('BusConfig');

    if (jsonConfig !== null && jsonConfig.length > 0) {
      try {
        $scope.config = JSON.parse(jsonConfig);
      } catch (e) {
        console.error(e)
      }
    }

    if (!$scope.config) {
      // Default config
      $scope.config = {
        agency: 'stl',
        stopId: 41220,
        minutesToShow: 5,
        hiddenRouteTags: '42O'
      };
    }
  }

  $scope.saveConfig = function () {
    window.localStorage.setItem('BusConfig', JSON.stringify($scope.config));
  }

  $scope.setStopId = function (id) {
    $scope.config.stopId = id;
    $scope.refresh();
  }

  $scope.isWithinMinutes = function (route) {
    //return function (route) {
    return route && route.minutes <= $scope.config.minutesToShow;
    //}
  };

  $scope.getStopLocationFromPredictions = function (predictions) {

    return $q(function (resolve, reject) {
      if (predictions && ($scope.stop == undefined || $scope.stop.stopId != $scope.config.stopId)) {

        var route = predictions[0].routeTag;

        $http({
          url: $scope.nextBusApiUrl,
          params: {
            command: 'routeConfig',
            a: $scope.config.agency,
            r: route
          }
        }).then(function (result) {
          $scope.stop = result.data.route.stop.find(s => {
            return s.stopId == $scope.config.stopId;
          });

          console.log('Found stop: ', $scope.stop);

          // Init map
          $scope.mapMarkers = [];
          $scope.map = new google.maps.Map(document.getElementById('map'), {
            center: $scope.getStopPosition(),
            zoom: 14,
            streetViewControl: false,
            mapTypeControl: false
          });

          // Add marker
          new google.maps.Marker({
            position: $scope.getStopPosition(),
            map: $scope.map,
            icon: {
              url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
            }
          });

          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  $scope.refreshNow = function () {
    $scope.nextRefresh = $scope.refreshInterval;
    $scope.loading = true;

    $http({
      url: $scope.nextBusApiUrl,
      params: {
        command: 'predictions',
        a: $scope.config.agency,
        stopId: $scope.config.stopId
      }
    }).then(function (result) {
      $scope.data = result.data;
      $scope.allPredictions = [];

      // Extract all predictions
      if ($scope.data.predictions) {

        // Get bus stop location
        $scope.getStopLocationFromPredictions($scope.data.predictions).then(function () {

          $scope.data.predictions.forEach(function (route) {
            // Skip routes on match
            if ($scope.config.hiddenRouteTags.indexOf(route.routeTag) >= 0) {
              return;
            }

            // Skip no directions
            if (!route.direction) {
              return;
            }

            // Fix property not an array when only 1 item
            if (!angular.isArray(route.direction.prediction)) {
              route.direction.prediction = [route.direction.prediction];
            }

            // Extract predictions
            $scope.allPredictions = route.direction.prediction.map(d => {
              return {
                route: route.routeTitle,
                routeTag: route.routeTag,
                minutes: parseInt(d.minutes),
                vehicle: d.vehicle
              };
            });

          });

          $scope.loading = false;

          $scope.showBusOnMap();
        });
      }
    });
  };

  $scope.refresh = $debounce($scope.refreshNow, 1000);

  $scope.clearMapMarkers = function () {
    $scope.mapMarkers.forEach(m => {
      m.setMap(null);
    });
    $scope.mapMarkers = [];
  }

  $scope.addMapMarker = function (lat, lon, title, vehicleId) {
    $scope.mapMarkers.push(new google.maps.Marker({
      position: {
        lat: lat,
        lng: lon
      },
      title: title,
      map: $scope.map,
      vehicleId: vehicleId
    }));
  }

  $scope.showBusOnMap = function () {
    var predictions = $scope.allPredictions.filter($scope.isWithinMinutes);
    var vehicleLocationPromises = predictions.map(function (route) {
      return $http({
        url: $scope.nextBusApiUrl,
        params: {
          command: 'vehicleLocation',
          a: $scope.config.agency,
          v: route.vehicle
        }
      })
    });

    // When all location loaded
    $q.all(vehicleLocationPromises).then(function (vehicleLocations) {

      $scope.clearMapMarkers();
      $scope.vehicleLocations = [];

      // Add marker for each bus
      vehicleLocations.forEach(v => {
        $scope.vehicleLocations.push(v.data.vehicle);

        $scope.addMapMarker(
          parseFloat(v.data.vehicle.lat),
          parseFloat(v.data.vehicle.lon),
          v.data.vehicle.routeTag,
          v.data.vehicle.id);
      });
    });
  }

  $scope.getVehicleSpeed = function (id) {
    var vehicle = $scope.vehicleLocations.find(v => v.id == id);

    return vehicle ? vehicle.speedKmHr : '?';
  }

  $scope.getStopPosition = function () {
    return { lat: parseFloat($scope.stop.lat), lng: parseFloat($scope.stop.lon) };
  }

  $scope.mapCenterOnStop = function () {
    $scope.map.setCenter($scope.getStopPosition());
  }

  $scope.mapCenterOnVehicle = function (vehicleId) {
    var marker = $scope.mapMarkers.find(m => m.vehicleId == vehicleId);

    if (marker) {
      $scope.map.setCenter(marker.getPosition());
    }
  }

  $scope.$watch('config', $scope.saveConfig, true);

  $scope.loadConfig();

  $interval(function () {
    if (!$scope.loading) {
      $scope.nextRefresh--;
      if ($scope.nextRefresh <= 0) {
        $scope.refreshNow();
      }
    };
  }, 1000);

}]);
