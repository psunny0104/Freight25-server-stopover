'use strict';

// import necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request-promise');
const schedule = require('node-schedule');
const cron = require('node-cron');
// Firebase setup
const firebaseAdmin = require('firebase-admin');
// you should manually put your service-account.json in the same folder app.js
// is located at.
const serviceAccount = require('./service-account.json');

// Initialize FirebaseApp with service-account.json
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
});

let db = firebaseAdmin.firestore();

// create an express app and use json body parser
const app = express();
app.use(bodyParser.json());

// default root url to test if the server is up
app.get('/', (req, res) => res.status(200)
.send('Freight25 Stopover server is up and running!'));

app.get('/stopover', (req,res) => {
  console.log("FreightId: " + req.query.freightId);
  var coordinates = [];
  var stopCnds = [];
  var freights = [];

  console.log("1. 기준 화물 정보 갱신");
  const freightId = req.query.freightId;
  const ref = db.collection('freights').doc(freightId);
  var startAddr_lat, startAddr_lon, endAddr_lat, endAddr_lon;


  console.log("2. 반경 포인트 정보 갱신");
  try{
    ref.get().then(function(doc) {
      if(doc.exists){
          console.log("Document data:", doc.data());
          startAddr_lat = doc.data().startAddr_lat;
          startAddr_lon = doc.data().startAddr_lon;
          endAddr_lat = doc.data().endAddr_lat;
          endAddr_lon = doc.data().endAddr_lon;

          const options = {
            method: 'POST',
            headers: {'appKey' : 'l7xxce3558ee38884b2da0da786de609a5be'},
            uri: 'https://apis.openapi.sk.com/tmap/truck/routes?version=1&format=json&callback=result',
            body: JSON.stringify({
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
            })
          };

          request.post(options)
          .then(function(response) {
            const jsonData = JSON.parse(response);
            //console.log(jsonData);
            
            for(let i=0; i<Object(jsonData.features).length; i++){
              if(Object(jsonData.features[i].geometry.type) == "Point"){
                //console.log(jsonData.features[i].geometry.type);
                coordinates.push({latitude: Number(jsonData.features[i].geometry.coordinates[1]), longitude:Number(jsonData.features[i].geometry.coordinates[0])});
              }
            }
            console.log("좌표개수: "+coordinates.length);
          })
          .then(function() {
            db.collection('freights').where("state", "==", 0).where("driveOption", "==", "혼적")
            .get()
            .then(async function(querySnapshot){
              console.log("3. 모든 freight 정보 갱신");
              for(var docCnt in querySnapshot.docs){
              //출발지
                const doc = querySnapshot.docs[docCnt].data();
                //두 점 사이의 거리  
                freights.push({
                  //가격
                  id: doc.id,
                  startX: doc.startAddr_lon,
                  startY: doc.startAddr_lat,
                  endX: doc.endAddr_lon,
                  endY: doc.endAddr_lat,
                  expense: doc.expense
                });                 
              }
              console.log("4. 거리 계산 시작");
              //console.log(freights);
              const limit = 10;

              for(var j = 0; j<freights.length; j++){
                if(freightId == freights[j].id)
                  continue;

                if(stopCnds.length == 3)
                  break;

                var dLat1 = freights[j].startY;
                var dLon1 = freights[j].startX;
                var dLat2;
                var dLon2;
                var distanceStart;
                var distanceEnd;
                
                var stopCndsFlag = false;

                //출발지
                for(var i = 0; i<coordinates.length; i++){
                  if(stopCndsFlag == true)
                    break;

                  if(stopCnds.length == 3)
                    break;

                  dLat2 = coordinates[i].latitude;
                  dLon2 = coordinates[i].longitude;
                  distanceStart = 100 * (Math.acos(Math.sin(dLat1)*Math.sin(dLat2) + Math.cos(dLat1)*Math.cos(dLat2)*Math.cos(dLon1 - dLon2)));

                  if(distanceStart<=limit){
                    //도착지
                    for(var k = coordinates.length-1; k>=0; k--){
                      var nLat1 = coordinates[k].latitude;
                      var nLon1 = coordinates[k].longitude;
                      var nLat2 = freights[j].endY;
                      var nLon2 = freights[j].endX;
                      //console.log("반경 lat: "+nLat1+" 반경 lon: "+nLon1+" 화물 lat: "+nLat2+" 화물 lon: "+nLon2);

                      distanceEnd = 100 * (Math.acos(Math.sin(nLat1)*Math.sin(nLat2) + Math.cos(nLat1)*Math.cos(nLat2)*Math.cos(nLon1 - nLon2)));
                      
                      //출발지, 도착지 모두 존재->경유지 추가
                      if(distanceEnd<=limit){
                        stopCnds.push({
                          radId: i+1,
                          freightOriId: freightId,
                          id: freights[j].id,
                          distanceStart: distanceStart,
                          distanceEnd: distanceEnd,
                          expense: freights[j].expense
                        })
                        //console.log("기준 화물 id: "+freightId+" 경유지 화물 id: "+freights[j].id+" 출발지 거리: "+distanceStart+" 도착지 거리: "+distanceEnd+" 비용: "+freights[j].expense);
                        stopCndsFlag = true;
                        break;
                      }
                    }
                  }
                }
              }

              if(stopCnds.length != 0){
                console.log("5. 내림차순 정렬");
                if(stopCnds.length >= 2){
                  var sortingField = "expense";
                  stopCnds.sort(function(a,b) {
                    return b[sortingField] - a[sortingField];
                  })
                  console.log(stopCnds);
                }
                console.log("6. 완료");
                res.status(200).json(stopCnds);
              }
              else{
                console.log("error");
                res.status(400).send({error: "NoStopover"});
              }  
            })
          })
        }
        else{
          console.log("error!");
          res.status(400).send({error: "noFreightDocument"});
        }
      }) 
    }
    catch { (error) => {
      console.log("error");
      res.status(400).send({error: error}).send({message: error.message});
    }
  }
});

//매주 월요일 정해진 시간에 서버에서 데이터 처리
const updatePb = () => {
  //준비
  var areas = ['강원','경기','경남','경북','광주','대구','대전','부산','서울','세종특별자치시','울산','인천','전남','전북','제주특별자치도','충남','충북'];
  var areasEng = ['gw','gg','gn','gb','gj','dg','dj','bs','se','sj','us','ic','jn','jb','jj','cn','cb'];
  var days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  var cnt = new Array(7);
  var newValue = new Array(7);
  var total = new Array(7);
  for(var i = 0; i<7; i++){
    cnt[i] = new Array(17);
    newValue[i] = new Array(17);
    total[i] = 0;
  }

  for(var i = 0; i<7; i++){
    for(var j = 0; j<17; j++){
      newValue[i][j] = 0;
      cnt[i][j] = 0;
    }
  }

  var areaMap = new Map();
  for(var i = 0; i<17; i++){
    areaMap.set(areas[i],i);
  }

  var dateWeekAgo = new Date();
  var dateNow = dateWeekAgo.getDate();
  dateWeekAgo.setDate(dateNow - 7);

  db.collection('freights').where("timeStampCreated",">=",dateWeekAgo)
    .get()
    .then(async function(querySnapshot){
      //저장
      for(var query in querySnapshot.docs){
        const doc = querySnapshot.docs[query].data();
        console.log(new Date(doc.timeStampCreated._seconds*1000));
        var day = new Date(doc.timeStampCreated._seconds*1000).getDay();
        var areaOrigin = doc.endAddr;
        var area = areaOrigin.split(" ",1);
        cnt[day][areaMap.get(area[0])] += 1;
        total[day] += 1;
      }
      //계산
      console.log(total[5]);
      for(var dayNum = 0; dayNum<7; dayNum++){
        for(var areaNum = 0; areaNum<17; areaNum++){
          console.log("cnt[dayNum][areaNum]  / total[dayNum] = "+cnt[dayNum][areaNum]+" / "+total[dayNum]);
          newValue[dayNum][areaNum] = Math.floor(100*(cnt[dayNum][areaNum]/total[dayNum]));
          console.log(dayNum+" "+areaNum+": "+newValue[dayNum][areaNum]+"\n");
        }
      }
      //db 갱신
      var batch = db.batch();
      for(var i = 0; i<7; i++){
        var fbDay = days[i];
        for(var j = 0; j<14; j++){
          var fbArea = areasEng[j];
          var ref = db.collection('probability').doc(fbDay);
          batch.update(ref,{fbArea: newValue[i][j]})
        }
      }
      batch.commit();
  });
};


//cron.schedule('*/5 * * * * *', function(){
cron.schedule('0 0 * * * 1', function(){
  // 월요일 0시 0분 갱신
  console.log('Freight25 Update Start!');
  updatePb();
});

// Start the server
const server = app.listen(process.env.PORT || '8000', () => {
  console.log('Freight25 Stopover server for Firebase listening on port %s',
  server.address().port);
});