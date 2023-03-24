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
        return res.status(401).json({ message: 'Unauthorized' });
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' });
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
        return res.status(401).json({ message: 'Username is already taken' });
    }

    await prisma.user.create({
        data: {
            username,
            password: hashedPassword,
        },
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not create user due to server error", error: err} );
    });

    res.status(200).json();
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
        return res.status(401).json({ message: 'Invalid username' });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
        return res.status(401).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user.id }, process.env.SECRET_KEY); // https://jwt.io

    res.status(200).json({ token });
});

// Get the current user
app.get('/me', protectRoute, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not get user due to server error", error: err} );
    });

    res.status(200).json(user);
});

// Get first 10 saved recipes for the logged-in user with optional page parameter
app.get('/user/recipes/:page?', protectRoute, async (req, res) => {
    if (req.params.page == null) {
        req.params.page = 1;
    }

    let savedRecipes = await prisma.recipe.findMany({
        where: {
            usersSaved: {
                some: {
                    id: req.params.id
                }
            }
        },
        skip: (req.params.page * 10) - 10,
        take : 10,
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not get saved recipes due to server error", error: err} );
    });

    // Remove some nutrition data from the response
    savedRecipes = await removeSomeNutrients(savedRecipes);

    res.status(200).json(savedRecipes);
});

// Delete a saved recipe for the logged-in user
app.delete('/user/:recipeId', protectRoute, async (req, res) => {
    const recipeId = req.params.recipeId;

    await prisma.userRecipe.findFirst({
        where: {
            userId: req.user.id,
            recipeId: recipeId,
        }
    }).then(async (userRecipe) => {
        await prisma.userRecipe.delete({
            where: {
                id: userRecipe.id,
            }
        })
    }).catch((err) => {
        console.log(err);
        res.status(500).json(err);
    });

    res.status(200).json({message: "Recipe deleted successfully"});
});

// Get a user by id
app.get('/user/:id', protectRoute, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not get user due to server error", error: err} );
    });

    res.status(200).json(user);
});

// Update a user
app.put('/user/:id', protectRoute, async (req, res) => {
    const user = await prisma.user.update({
        where: { id: req.params.id },
        data: req.body,
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not update user due to server error", error: err} );
    });

    res.status(200).json(user);
});

app.get('/ingredients', async (req, res) => {
    const ingredients = await prisma.ingredient.findMany({
        select: {
            name: true,
        }
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not get ingredients due to server error", error: err} );
    });

    res.status(200).json(ingredients);
});

// Delete a user
app.delete('/user/:id', protectRoute, async (req, res) => {
    const user = await prisma.user.delete({
        where: { id: req.params.id },
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not delete user due to server error", error: err} );
    });

    res.status(200).json(user);
});


// Save a recipe for a user
app.post('/user/:recipeId', protectRoute, async (req, res) => {
    const recipeId = req.params.recipeId;

    console.log(req.user.id);
    console.log(recipeId);

    if (await prisma.userRecipe.findFirst({
        where: {
            userId: req.user.id,
            recipeId: recipeId,
        }
    })) {
        return res.status(401).json({ message: 'Recipe is already saved' });
    }

    await prisma.userRecipe.create({
        data: {
            userId: req.user.id,
            recipeId: recipeId,
        }
    }).catch((err) => {
        console.log(err);
        res.status(500).json({message: "Recipe could not be saved"});
    });

    res.status(200).json({message: "Recipe saved successfully"});
});

// Get the first 10 recipes matching the keyword with optional page parameter
app.get('/recipes/:keyword/:page?', async (req, res) => {
    if (req.params.page === undefined || req.params.page < 0 || isNaN(req.params.page)) {
        req.params.page = 0;
    }

    let recipes = await prisma.recipe.findMany({
        where: {
            name: {
                contains: req.params.keyword,
                mode: "insensitive"
            },
        },
        skip: req.params.page * 10,
        take: 10,
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not get recipes due to server error", error: err} );
    });

    recipes = await removeSomeNutrients(recipes);

    res.status(200).json(recipes);
});

// Gets the first 10 recipes matching a keyword with optional page parameter and filters by diet labels, health labels, and max calories
app.post('/recipes/:keyword/:page?', async (req, res) => {
    if (req.params.page === undefined || req.params.page < 0 || isNaN(req.params.page)) {
        req.params.page = 0;
    }

    let {dietLabels, healthLabels, ingredients, maxCalories} = req.body;

    if (maxCalories === undefined || maxCalories < 0 || isNaN(maxCalories) || maxCalories === "") {
        maxCalories = 50000;
    }

    let recipes;

    if (ingredients.length === 0) {
        recipes = await prisma.recipe.findMany({
            where: {
                name: {
                    contains: req.params.keyword,
                    mode: "insensitive"
                },
                dietLabels: {
                    hasEvery: dietLabels
                },
                healthLabels: {
                    hasEvery: healthLabels
                },
                calories: {
                    lte: parseInt(maxCalories)
                }
            },
            skip: req.params.page * 10,
            take: 10,
        }).catch((err) => {
            console.log(err);
            res.status(500).json( {message: "Could not get recipes due to server error", error: err} );
        });
    } else {
        const ids = await prisma.ingredient.findMany({
            where: {
                name: {
                    in: ingredients
                }
            },
            select: {
                id: true,
            }
        })

        let ingredientIds = [];
        ids.forEach((ingredient) => {
            ingredientIds.push(ingredient.id);
        });

        const recIds = await prisma.recipeIngredient.findMany({
            select: {
                recipeId: true,
            },
            where: {
                ingredientId: {
                    in: ingredientIds
                }
            }
        });

        let recipeIds = [];
        recIds.forEach((recipe) => {
            recipeIds.push(recipe.recipeId);
        });

        recipes = await prisma.recipe.findMany({
            where: {
                name: {
                    contains: req.params.keyword,
                    mode: "insensitive"
                },
                dietLabels: {
                    hasEvery: dietLabels
                },
                healthLabels: {
                    hasEvery: healthLabels
                },
                calories: {
                    lte: parseInt(maxCalories)
                },
                id: {
                    in: recipeIds
                }
            },
            skip: req.params.page * 10,
            take: 10,
        }).catch((err) => {
            console.log(err);
            res.status(500).json( {message: "Could not get recipes due to server error", error: err} );
        });
    }

    recipes = await removeSomeNutrients(recipes);

    res.headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,PATCH,OPTIONS',
    }

    res.status(200).json(recipes);
});

// Get recipe by id
app.get('/recipe/:id', async (req, res) => {
    let recipe = await prisma.recipe.findUnique({
        where: { id: req.params.id },
    }).catch((err) => {
        console.log(err);
        res.status(500).json( {message: "Could not get recipe due to server error", error: err} );
    });

    recipe = await removeSomeNutrients([recipe]);

    res.status(200).json(recipe[0]);
});

// Get a random recipe
app.get('/recipe', async (req, res) => {
    let limit = 1000
    do {
        const count = await prisma.recipe.count();
        let random = Math.floor(Math.random() * count);

        let recipe = await prisma.recipe.findMany({
            skip: random,
            take: 1,
        });

        if (recipe.length > 0) {
            recipe = await removeSomeNutrients([recipe[0]]);
            console.log("this is it ", recipe);
            return res.status(200).json(recipe[0]);
        }

        limit -= 1;
    } while (limit > 0);

    res.status(404).json({ message: "No recipes found" });
});

// Get recipe by id then get the image from the recipe by size
app.get('/recipe/:id/image/:size', async (req, res) => {
    await prisma.recipe.findUnique({
        where: { id: req.params.id },
        select: { images: true }
    }).then(async recipe => {
        const filename = recipe.images[req.params.size];

        if (filename === undefined || filename === null) {
            return res.status(404).json({ message: "Image not found" });
        } else {
            res.status(200).json("https://smoothie-images.ams3.digitaloceanspaces.com/" + recipe.images[req.params.size]);
        }

    }).catch(err => {
        console.log(err)
        res.status(500).json({ message: "There was a server error when trying to get image", error: err });
    });
});

// Get the largest possible image for recipe by id
app.get('/recipe/:id/largest-image', async (req, res) => {
    await prisma.recipe.findUnique({
        where: { id: req.params.id },
        select: { images: true }

    }).then(async recipe => {
        let size = Object.keys(recipe.images)[Object.keys(recipe.images).length - 1]
        res.status(200).json("https://smoothie-images.ams3.digitaloceanspaces.com/" + recipe.images[size]);

    }).catch(err => {
        console.log(err)
        res.status(500).json({ message: "There was a server error when trying to get image", error: err });
    });
});

// Get the smallest possible image for recipe by id
app.get('/recipe/:id/smallest-image', async (req, res) => {
    await prisma.recipe.findUnique({
        where: { id: req.params.id },
        select: { images: true }

    }).then(async recipe => {
        let size = Object.keys(recipe.images)[0]
        console.log(size)
        res.status(200).json("https://smoothie-images.ams3.digitaloceanspaces.com/" + recipe.images[size]);

    }).catch(err => {
        console.log(err)
        res.status(500).json({ message: "There was a server error when trying to get image", error: err });
    });
});

async function removeSomeNutrients(recipes) {
    for (let i = 0; i < recipes.length; i++) {

        for (let nutrient of recipes[i].nutrients) {
            let name = nutrient.label;
            if (name !== "Energy" && name !== "Protein" && name !== "Fat" && name !== "Saturated" && name !== "Trans" && name !== "Carbs" && name !== "Sugars" && name !== "Fiber" && name !== "Sodium") {
                recipes[i].nutrients = recipes[i].nutrients.filter((item) => item.label !== nutrient.label);
            }
        }

        for (let nutrient of recipes[i].dailyNutrients) {
            let name = nutrient.label;
            if (name !== "Energy" && name !== "Protein" && name !== "Fat" && name !== "Saturated" && name !== "Trans" && name !== "Carbs" && name !== "Sugars" && name !== "Fiber" && name !== "Sodium") {
                recipes[i].dailyNutrients = recipes[i].dailyNutrients.filter((item) => item.label !== nutrient.label);
            }
        }
    }

    return recipes;
}

app.listen(3000, () => {
    console.log('Server started on port 3000');
});
