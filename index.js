const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const app = express();
const request = require('request-promise');

const cors = require('cors')({
  origin: true,
});

app.use(cors);
admin.initializeApp();

const db = admin.firestore();

function getStopover(startAddr_lat,startAddr_lon,endAddr_lat,endAddr_lon){
  console.log('Requesting stopover points from Tmap API server.');
  const options = {
    method: 'POST',
    headers: {'appKey' : 'l7xxce3558ee38884b2da0da786de609a5be'},
    uri: 'https://apis.openapi.sk.com/tmap/truck/routes?version=1&format=json&callback=result',
    body: {
      "startX" : startAddr_lon,
      "startY" : startAddr_lat, 
      "endX" : endAddr_lon,
      "endY" : endAddr_lat,
      "reqCoordType" : "WGS84GEO",
      "resCoordType" : "WGS84GEO",
      "angle" : "172",
      "searchOption" : '1',
      "trafficInfo" : "Y",
      "truckType" : "1",
      "truckWidth" : "100",
      "truckHeight" : "100",
      "truckWeight" : "35000",  // 트럭 무게를 의미하기 때문에 값을 불러오는것이 좋을 듯
      "truckTotalWeight" : "35000", // 화물 무게도 불러올 것
      "truckLength" : "200",  // 길이 및 높이는 일반적인 트럭 (2.5톤 트럭의 크기 등) 을 따를 것        
    }
  };
  request.post(options)
  .then(function(response) {
    return response.json();
  })
  .then(function(jsonData) {
    return JSON.stringify(jsonData);
  });
}

app.get('/stopover', (req,res) => {
  console.log(req.query.freightId);
  const freightId = req.query.freightId;
  const ref = db.collection('freights').doc(freightId);
  var startAddr_lat, startAddr_lon, endAddr_lat, endAddr_lon;

  ref.get().then(function(doc) {
    if (doc.exists) {
        console.log("Document data:", doc.data());
        startAddr_lat = doc.data().startAddr_lat;
        startAddr_lon = doc.data().startAddr_lon;
        endAddr_lat = doc.data().endAddr_lat;
        endAddr_lon = doc.data().endAddr_lon;
    } else {
        // doc.data() will be undefined in this case
        console.log("No such document!");
    }
  }).catch(function(error) {
      console.log("Error getting document:", error);
  });

  res.status(200).json(getStopover(startAddr_lat,startAddr_lon,endAddr_lat,endAddr_lon));
});

// Expose Express API as a single Cloud Function:
exports.app = functions.https.onRequest(app);