
// src/dbStub.js
// Lightweight stub that maps the previous Firestore-style calls to REST API endpoints.
// It expects the backend to be available at REACT_APP_API_BASE or default http://localhost:4000

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : (process.env.REACT_APP_API_BASE || 'http://localhost:4000');

export function serverTimestamp(){ return new Date(); }

export function collection(db, name){
  return { name };
}

export function doc(db, collectionRef, id){
  return { collection: collectionRef.name || collectionRef, id };
}

export async function addDoc(collectionRef, payload){
  const name = collectionRef.name || collectionRef;
  if (name.includes('pedido') || name.includes('pedidos') || name.includes('doceeser')) {
    const res = await fetch(`${API_BASE}/api/pedidos`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    return { id: j.id };
  } else {
    // generic: save to carts endpoint requiring userId in payload
    const userId = payload.userId || 'guest';
    await fetch(`${API_BASE}/api/carts/${userId}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items: payload.items || []})
    });
    return { id: userId };
  }
}

export async function setDoc(docRef, data){
  // used for carts; docRef.id is userId
  const userId = docRef.id;
  await fetch(`${API_BASE}/api/carts/${userId}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({items: data.items || []})
  });
}

export async function getDoc(docRef){
  const res = await fetch(`${API_BASE}/api/pedidos/${docRef.id}`);
  if (res.status === 200){
    const j = await res.json();
    return {
      exists: () => true,
      data: () => j,
      id: docRef.id
    };
  } else {
    return { exists: () => false };
  }
}

export function onSnapshot(docRef, callback){
  // open EventSource to stream updates
  const id = docRef.id;
  const es = new EventSource(`${API_BASE.replace(/^http/, 'http')}/api/pedidos/stream/${id}`);
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      callback({
        exists: () => true,
        data: () => (data),
        id
      });
    } catch(e){}
  };
  es.onerror = (e) => {
    // silently ignore
  };
  return () => es.close();
}

// simple placeholder db object
export const db = { stub: true };
