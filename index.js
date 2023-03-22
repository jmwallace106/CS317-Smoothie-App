// https://www.bezkoder.com/node-js-jwt-authentication-mysql/#Setup_Express_web_server
// https://www.digitalocean.com/community/tutorials/nodejs-jwt-expressjs

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

// protects routes from unauthorized access by verifying the token with the secret key and adding the user id to the request
function protectRoute(req, res, next) {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        req.user = decoded;
        next();
    });
}

// User registration
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    if (await prisma.user.findUnique({ where: { username: username } })) {
        return res.status(401).json({ error: 'Username is already taken' });
    }

    const user = await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
        },
    });

    res.json(user);
});

// User login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({
        where: {
            username: username,
        }
    });


    if (!user) {
        return res.status(401).json({ error: 'Invalid username' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id }, process.env.SECRET_KEY); // https://jwt.io
    res.json({ token: token });
});

// Get the current user
app.get('/me', protectRoute, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
    });
    res.json(user);
});

// Get a user by id
app.get('/users/:id', protectRoute, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
    });
    res.json(user);
});

// Update a user
app.put('/users/:id', protectRoute, async (req, res) => {
    const user = await prisma.user.update({
        where: { id: req.params.id },
        data: req.body,
    });
    res.json(user);
});

// Delete a user
app.delete('/users/:id', protectRoute, async (req, res) => {
    const user = await prisma.user.delete({
        where: { id: req.params.id },
    });
    res.json(user);
});

// Get all saved recipes for a user
app.get('/users/:id/recipes', protectRoute, async (req, res) => {
    const savedRecipes = await prisma.recipe.findMany({
        where: {
            usersSaved: {
                some: {
                    id: req.params.id
                }
            }
        }
    });

    return res.json(savedRecipes);
});

// Get recipe by id
app.get('/recipe/:id', async (req, res) => {
    const recipe = await prisma.recipe.findUnique({
        where: { id: req.params.id },
    });
    res.json(recipe);
});

// Get a random recipe
app.get('/recipe', async (req, res) => {
    do {
        const count = await prisma.recipe.count();
        console.log(count)
        let random = Math.floor(Math.random() * count);
        console.log(random)

        const recipe = await prisma.recipe.findMany({
            skip: random,
            take: 1,
        });

        if (recipe.length > 0) {
            return res.json(recipe);
        }

    } while (true);
});

// Get all recipes with a specific keyword in the name
app.get('/recipes/:keyword', async (req, res) => {
    const recipes = await prisma.recipe.findMany({
        where: {
            name: {
                contains: req.params.keyword,
                mode: "insensitive"
            }
        }
    });
    res.json(recipes);
});

// Get recipe by id then get the image from the recipe by size
app.get('/recipe/:id/image/:size', async (req, res) => {
    await prisma.recipe.findUnique({
        where: { id: req.params.id },
        select: { images: true }
    }).then(async recipe => {
        const filename = recipe.images[req.params.size];

        if (filename === undefined || filename === null) {
            return res.status(404).json({ error: "Image not found" });
        } else {
            res.json("https://smoothie-images.ams3.digitaloceanspaces.com/" + recipe.images[req.params.size]);
        }

    }).catch(err => {
        console.log(err)
        res.status(404).json({ error: err });
    });
});

// Get the largest possible image for recipe by id
app.get('/recipe/:id/image/largest/', async (req, res) => {
    await prisma.recipe.findUnique({
        where: { id: req.params.id },
        select: { images: true }

    }).then(async recipe => {
        let size = Object.keys(recipe.images)[Object.keys(recipe.images).length - 1]
        res.json("https://smoothie-images.ams3.digitaloceanspaces.com/" + recipe.images[size]);
    });
});

// Get the smallest possible image for recipe by id
app.get('/recipe/:id/image/smallest/', async (req, res) => {
    await prisma.recipe.findUnique({
        where: { id: req.params.id },
        select: { images: true }
    }).then(async recipe => {
        let size = Object.keys(recipe.images)[0]
        res.json("https://smoothie-images.ams3.digitaloceanspaces.com/" + recipe.images[size]);
    });
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
});
