const firebase = require('firebase/app');
require('firebase/database');

const firebaseConfig = {
  apiKey: "AIzaSyCBC6_DRCiMwoGPIM1uexpfvXQIaeF-DOc",
  authDomain: "socail-media-creation.firebaseapp.com",
  databaseURL: "https://socail-media-creation-default-rtdb.firebaseio.com",
  projectId: "socail-media-creation"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
db.ref('.info/connected').once('value').then(snap => {
    console.log("Connected:", snap.val());
    process.exit(0);
}).catch(e => {
    console.error(e);
    process.exit(1);
});
