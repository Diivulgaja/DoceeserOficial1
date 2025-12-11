
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/painelmobile';

mongoose.connect(MONGO, { useNewUrlParser:true, useUnifiedTopology:true })
  .then(()=>console.log('Connected to MongoDB'))
  .catch((err)=>console.error('MongoDB error', err));

const Schema = mongoose.Schema;

const OrderSchema = new Schema({
  items: { type: Array, default: [] },
  total: Number,
  status: { type: String, default: 'novo' },
  createdAt: { type: Date, default: Date.now },
  userId: String,
  extra: Schema.Types.Mixed
});
const CartSchema = new Schema({
  userId: { type: String, unique: true },
  items: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', OrderSchema);
const Cart = mongoose.model('Cart', CartSchema);

// Simple in-memory subscribers for SSE per order id
const subscribers = {};

app.post('/api/pedidos', async (req, res) => {
  try {
    const payload = req.body;
    payload.createdAt = new Date();
    const order = new Order(payload);
    await order.save();
    // notify subscribers
    const id = order._id.toString();
    if (subscribers[id]) {
      subscribers[id].forEach(fn => fn(order));
    }
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create order' });
  }
});

app.get('/api/pedidos/:id', async (req,res)=>{
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({error:'not found'});
    res.json(order);
  } catch(e){
    console.error(e);
    res.status(500).json({error:'failed'});
  }
});

// SSE endpoint to stream updates for a particular order id
app.get('/api/pedidos/stream/:id', async (req,res)=>{
  const id = req.params.id;
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();

  // Send current order once
  try {
    const order = await Order.findById(id).lean();
    if (order) {
      res.write(`data: ${JSON.stringify(order)}\n\n`);
    }
  } catch(e){}

  const push = (order) => {
    try {
      res.write(`data: ${JSON.stringify(order)}\n\n`);
    } catch(e){}
  };
  subscribers[id] = subscribers[id] || [];
  subscribers[id].push(push);

  req.on('close', () => {
    subscribers[id] = (subscribers[id]||[]).filter(fn=>fn!==push);
  });
});

// Cart endpoints
app.get('/api/carts/:userId', async (req,res)=>{
  const userId = req.params.userId;
  const cart = await Cart.findOne({userId}).lean();
  if (!cart) return res.json({items:[]});
  res.json(cart);
});
app.post('/api/carts/:userId', async (req,res)=>{
  const userId = req.params.userId;
  const items = req.body.items || [];
  const doc = await Cart.findOneAndUpdate({userId},{items, updatedAt:new Date()},{upsert:true, new:true});
  res.json(doc);
});

// general endpoint to update order status
app.post('/api/pedidos/:id/status', async (req,res)=>{
  try {
    const id = req.params.id;
    const status = req.body.status;
    const order = await Order.findByIdAndUpdate(id, {status}, {new:true});
    if (order && subscribers[id]) subscribers[id].forEach(fn=>fn(order));
    res.json(order);
  } catch(e){
    res.status(500).json({error:'failed'});
  }
});

app.listen(PORT, ()=>console.log('Backend running on', PORT));
