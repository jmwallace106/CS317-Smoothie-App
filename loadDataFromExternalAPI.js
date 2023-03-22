// This script takes roughly 50/60 mins to run and loads 10000 smoothie recipes from the Edamam API into the database
// It takes so long because the API only allows 10 requests per minute, so we need to wait 6 seconds between each request and only get 20 recipes per request
// The script also checks that each recipe has all the required fields and that each ingredient has all the required fields
// If a recipe or ingredient is missing a required field, it is not added to the database
// The script also checks that each ingredient is unique and only adds it to the database if it is unique
// This script is run once to load the data into the database and then the API is used to serve the data to and from the client
// Work in progress but nearly there, it currently works and the data is loaded into the database, but I just want to add some more error handling/validation and tidy the model up a bit

const { PrismaClient } = require('@prisma/client')
const { ObjectId} = require('bson')
const fs = require('fs');

const prisma = new PrismaClient()

const baseURL = "https://api.edamam.com/api/recipes/v2?type=public&q=";
const appID = "81c3484e";
const query = "smoothie";
const url = baseURL + query + "&app_id=" + appID + "&app_key=" + process.env.APP_KEY;

let processedRecipes = 0;
let remainingRecipes = 0;
let recipes = [];
let ingredients = [];
let recipeIngredients = [];

async function main() {

    let response = await fetch(url);
    let data = await response.json();
    await processData(data.hits);
    await delay(6100);
    remainingRecipes = data.count;
    console.log("Processed " + (processedRecipes += data.hits.length) + " recipes. Remaining: " + (remainingRecipes -= data.hits.length))

    while (remainingRecipes > 9000) {
        response = await fetch(data._links.next.href);
        data = await response.json();
        await processData(data.hits);
        await delay(6100);
        console.log("Processed " + (processedRecipes += data.hits.length) + " recipes. Remaining: " + (remainingRecipes -= data.hits.length))
    }

    await prisma.$connect()
    console.log("Connected to DB")
    console.log(recipes[0])

    await prisma.recipe.createMany({
        data: recipes
    })

    await prisma.ingredient.createMany({
        data: ingredients
    })

    await prisma.recipeIngredient.createMany({
        data: recipeIngredients
    })

    await prisma.$disconnect()
    console.log("Disconnected from DB")
}

async function processData(hits) {
    for (let i = 0; i < hits.length; i++) {
        let recipe = hits[i].recipe;

        if (checkRecipeIsValid(recipe)) {
            let recipeId = new ObjectId().toString();

            let fileNames = {}
            let filename
            for (let image in recipe.images) {
                filename = new ObjectId().toString() + ".jpg";
                fileNames[image] = filename;

                await fetch(recipe.images[image].url).then(async (response) => {
                    await fs.writeFile("images/" + filename, Buffer.from(await response.arrayBuffer()), null ,function (err) {
                        if (err) {
                            console.log("Error saving " + image + " for recipe: " + recipe.label);
                            return console.log(err);
                        }
                    })
                })
            }

            let nutrients = []
            for (let nutrient in recipe.totalNutrients) {
                nutrients.push(recipe.totalNutrients[nutrient])
            }

            let dailyNutrients = []
            for (let nutrient in recipe.totalDaily) {
                dailyNutrients.push(recipe.totalDaily[nutrient])
            }


            recipes.push({
                id: recipeId,
                name: recipe.label,
                images: fileNames,
                ingredientLines: recipe.ingredientLines,
                servings: recipe.yield,
                dietLabels: recipe.dietLabels,
                healthLabels: recipe.healthLabels,
                calories: recipe.calories,
                nutrients: nutrients,
                dailyNutrients: dailyNutrients,
                cautions: recipe.cautions,
                link: recipe.url,
            });

            for (let {food, foodCategory, quantity, text, measure} of recipe.ingredients) {
                let ingredientId = new ObjectId().toString();

                if (ingredients.find(ingredient => ingredient.name === food)) {
                    continue;
                } else {
                    ingredients.push({
                        id: ingredientId,
                        name: food,
                        category: foodCategory,
                    });
                }

                recipeIngredients.push({
                    text: text,
                    quantity: quantity,
                    measure: measure,
                    recipeId: recipeId,
                    ingredientId: ingredientId,
                });
            }
        }
    }
}

function checkRecipeIsValid(recipe) {
    let valid = true;
    let requiredRecipeFields = ["label", "ingredientLines", "ingredients", "yield", "images", "dietLabels", "healthLabels", "totalNutrients", "totalDaily", "cautions", "calories", "url"];
    let requiredIngredientFields = ["food", "foodCategory", "quantity", "text", "measure"];

    // Must have all required fields for recipe collection
    for (let i = 0; i < requiredRecipeFields.length; i++) {
        if (!recipe.hasOwnProperty(requiredRecipeFields[i]) || recipe[requiredRecipeFields[i]] === null) {
            valid = false;
        }
    }

    // Must have all required fields for each ingredient
    for (let i = 0; i < recipe.ingredients.length; i++) {
        for (let j = 0; j < requiredIngredientFields.length; j++) {
            if (!recipe.ingredients[i].hasOwnProperty(requiredIngredientFields[j]) || recipe.ingredients[i][requiredIngredientFields[j]] === null) {
                valid = false;
            }
        }
    }

    // Must have THUMBNAIL, SMALL and REGULAR images
    if (!recipe.images.hasOwnProperty("THUMBNAIL") || recipe.images["THUMBNAIL"] === null ||
        !recipe.images.hasOwnProperty("SMALL") || recipe.images["SMALL"] === null ||
        !recipe.images.hasOwnProperty("REGULAR") || recipe.images["REGULAR"] === null) {

            valid = false;
    }


    return valid;
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

main().then(() => {
    console.log("Finished");
}).catch(e => {
    console.error(e)
    process.exit(1)
});