require("dotenv").config();

const express = require("express");
const app = express();


const { createServer } = require("http");
const { Server } = require("socket.io");

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});


const helmet = require("helmet");
app.use(helmet.xssFilter());

// Allows stylesheets, JS scripts, and other files to be loaded
app.use(express.static(__dirname + "/public"));

// Allows EJS to be used instead of HTML
app.set("view engine", "ejs");

// Displays index.ejs by default
app.get("/", (req, res) => {
  res.render("index", { room: "" });
});

// Display index.ejs with the room that was entered
app.get("/:room", (req, res) => {
  res.render("index", { room: req.params.room });
});

// Socket.io Handling
let connectedUsers = []; // Array of users connected to a room
let userMessages = []; // Array of messages

// Creates listeners for all sockets
io.on("connection", (socket) => {
  // Removes the user that left from connectedUsers
  socket.on("disconnect", () => {
    connectedUsers = connectedUsers.filter((user) => user.id !== socket.id);
    socket.broadcast.emit("updateUserList", { users: connectedUsers });
    console.log("A user disconnected");
  });

  // Connects the user to the room and creates more listeners
  socket.on("joinRoom", (room, username) => {
    socket.join(room);

    // Clear previous messages when no one is in the room
    if (
      connectedUsers.filter((user) => user.room === room).length == 0 ||
      connectedUsers.length == 0
    ) {
      userMessages = userMessages.filter((obj) => obj.room !== room);
    }

    // Checks if a new user has been connected
    let result =
      connectedUsers.length > 0
        ? connectedUsers.find((user) => user.id === socket.id)
        : undefined;

    // Adds the new user to the array
    if (result == undefined) {
      connectedUsers.push({
        id: socket.id,
        username: username,
        room: room,
      });
    }

    console.log("A user join room '" + room + "'");

    // Sends the updated list of users to the client
    socket.on("requestUserList", () => {
      io.to(room).emit("updateUserList", { users: connectedUsers });
    });

    // Removes the user from a full room and allows the client to display a message
    socket.on("removeUser", (user) => {
      if (
        socket.id === user.id &&
        connectedUsers.filter((u) => u.room === user.room).length > 2
      ) {
        console.log("user was removed");
        socket.leave(user.room);
        connectedUsers = connectedUsers.filter((u) => u.id != user.id);
      }

      // Sends the message ONLY to the user that was removed
      socket.to(user.id).emit("roomFull");
    });

    // Tells the client to create a media offer for the second peer
    socket.on("mediaOffer", (data) => {
      socket.to(data.to).emit("mediaOffer", {
        from: data.from,
        offer: data.offer,
      });
    });

    // Tells the client to create a media answer for the first peer
    socket.on("mediaAnswer", (data) => {
      socket.to(data.to).emit("mediaAnswer", {
        from: data.from,
        answer: data.answer,
      });
    });

    // Tells the client to add the ICE candidate for all peers
    socket.on("iceCandidate", (data) => {
      socket.to(data.to).emit("remotePeerIceCandidate", {
        candidate: data.candidate,
      });
    });

    // Sends all messages in the room to the client
    socket.on("requestMessages", () => {
      socket.emit("getMessages", { userMessages: userMessages });
    });

    // Adds messages to userMessages and adds a message to the room
    socket.on("message", (message) => {
      userMessages.push({
        room: room,
        message: message,
        userId: socket.id,
        username: username,
      });
      io.to(room).emit("createMessage", message, socket.id, username);
    });
  });
});

// Sets the port used to access my app
const listener = server.listen(process.env.PORT || 8080, () => {
  console.log("Your app is listening on port " + listener.address().port);
});

module.exports = app; // For unit testing
