const db =  require("../configuration/sequelize");
const Images = db.images;
const Product = db.product;
const Crypto = require("crypto");
const User = db.user;
const bcrypt=require('bcrypt');
var mysql = require("mysql");
const logger = require("../logger");
const SDC = require('statsd-client');
const sdc = new SDC({
    host: "localhost",
    port: 8125
});

const { S3Client,DeleteObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.BUCKET_REGION,
});

const randomImageName = (filename) => {
  const randomString = Crypto.randomBytes(16).toString("hex");
  const ext = filename.split(".").pop();
  return `${randomString}-${filename}`;
};

const getUsername = (req) => {
  const decoded = Buffer.from(
    req.get("Authorization").split(" ")[1],
    "base64"
  ).toString();
  const [username, pass] = decoded.split(":");
  return username;
};

const authUser = async (req, productId) => {
  const username = getUsername(req);
  const userId = await User.findOne({ where: { username: username } });
  const product = await Product.findOne({ where: { id: productId } });


  if (product.owner_user_id == userId.id) {

    return true;
  }

  return false;
};


const addImage = async (req, res, next) => {
   sdc.increment('add/image');
    const auth = req.headers.authorization;
    if (!auth || auth.indexOf('Basic ') === -1) return res.status(403).json("Forbidden Request")
    const base64Credentials = auth.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [usernamegetting, passwordgetting] = credentials.split(':');
    if (!usernamegetting || !passwordgetting) {
      logger.error("Invalid Authentication Details");
        return res.status(403).json("Invalid Authentication Details");
    }
    const usr = await db.user.findOne({ where: { username: usernamegetting } })
    if (usr === null) {
      logger.error("Invalid Authentication Details");
        return res.status(400).json('Invalid Authentication Details');
    }
    else {
        let passcheck = false;
        const passwordstoreduser = usr.password;
        // var hashedPassword = await bcrypt.hash(passwordstoreduser, 10);
        if (await bcrypt.compare(passwordgetting, passwordstoreduser)) {
            passcheck = true;
        }
        if (passcheck == false) {
          logger.error("Invalid Credentials Details");
            return res.status(401).json('Invalid Credentials');
        }

    try {
      const { productid } = req.params;
  
      const productIdCheck = parseInt(productid);
      if (productIdCheck != productid) {
        logger.error("Bad Request: Invalid Product Id");
        return res.status(400).send({
          error: "Bad Request: Invalid Product Id",
        });
      }
  
      if (await authUser(req, productid)) {
        console.log(req.file);
        const { filename, path } = req.file;
        
        const params = {
          Bucket: process.env.BUCKET_NAME,
          Key: randomImageName(req.file.originalname),
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        };
  
        const data = await s3.send(new PutObjectCommand(params));
  
        const image = await Images.create({
          product_id: productid,
          file_name: req.file.originalname,
          s3_bucket_path: "s3://" + process.env.BUCKET_NAME + "/" + params.Key,
          date_created: new Date(),
        });
        res.status(201).send({
          image_id: image.dataValues.image_id,
          product_id: image.dataValues.product_id,
          file_name: image.dataValues.file_name,
          s3_bucket_path: image.dataValues.s3_bucket_path,
          date_created: image.dataValues.date_created,
        });
      } else {
        logger.error("You are not authorized to add images to this product.");
        return res.status(403).json({
          message: "You are not authorized to add images to this product.",
        });
      }
    } catch (error) {
      console.log(error);
      logger.error("Failed to add product image");
      res.status(400).json({ message: "Failed to add product image" });
    }
  }}
  ;

  const getImage = async (req, res, next) => {
    sdc.increment('get/image');
    const auth = req.headers.authorization;
    if (!auth || auth.indexOf('Basic ') === -1) return res.status(403).json("Forbidden Request")
    const base64Credentials = auth.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [usernamegetting, passwordgetting] = credentials.split(':');
    if (!usernamegetting || !passwordgetting) {
      logger.error("Invalid Authentication Details");
        return res.status(403).json("Invalid Authentication Details");
    }
    const usr = await db.user.findOne({ where: { username: usernamegetting } })
    if (usr === null) {
      logger.error("Invalid Authentication Details");
        return res.status(400).json('Invalid Authentication Details');
    }
    else {
        let passcheck = false;
        const passwordstoreduser = usr.password;
        // var hashedPassword = await bcrypt.hash(passwordstoreduser, 10);
        if (await bcrypt.compare(passwordgetting, passwordstoreduser)) {
            passcheck = true;
        }
        if (passcheck == false) {
          logger.error("Invalid Credentials");
            return res.status(401).json('Invalid Credentials');
        }

        try {
          const { productid, imageid } = req.params;
      
          const productIdCheck = parseInt(productid);
          if (productIdCheck != productid) {
            logger.error("Bad Request: Invalid Product Id");
            return res.status(400).send({
              error: "Bad Request: Invalid product Id",
            });
          }
      
          const id = req.params.imageid;
          const imgIdCheck = parseInt(id);
          console.log(id);
          console.log(imgIdCheck);
          
          if (imgIdCheck != id) {
            logger.error("Bad Request: Invalid Image Id");
            return res.status(400).send({
              error: "Bad Request: Invalid Image Id",
            });
          }
          if (await authUser(req, productid)) {
            const image = await Images.findOne({
              where: { product_id: productid, image_id: imageid },
            });
            if (image) {
              logger.info(image);
              res.json(image);
            } else {
              logger.error("Image not found");
              res.status(404).json({ message: "Image not found" });
            }
          } else {
            logger.error("You are not authorized to view images of this product.");
            return res.status(403).json({
              message: "You are not authorized to view images of this product.",
            });
          }
        } catch (error) {
          console.log(error);
          logger.error("Failed to get product image");
          res.status(400).json({ message: "Failed to get product image" });
        }
      }
    }
    ;

  const getAllImages = async (req, res, next) => {
    sdc.increment('getall/image');
    const auth = req.headers.authorization;
    if (!auth || auth.indexOf('Basic ') === -1) return res.status(403).json("Forbidden Request")
    const base64Credentials = auth.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [usernamegetting, passwordgetting] = credentials.split(':');
    if (!usernamegetting || !passwordgetting) {
      logger.error("Invalid Authentication Details");
        return res.status(403).json("Invalid Authentication Details");
    }
    const usr = await db.user.findOne({ where: { username: usernamegetting } })
    if (usr === null) {
      logger.error("Invalid Authentication Details");
        return res.status(400).json('Invalid Authentication Details');
    }
    else {
        let passcheck = false;
        const passwordstoreduser = usr.password;
        // var hashedPassword = await bcrypt.hash(passwordstoreduser, 10);
        if (await bcrypt.compare(passwordgetting, passwordstoreduser)) {
            passcheck = true;
        }
        if (passcheck == false) {
            logger.error("Invalid Credentials");
            return res.status(401).json('Invalid Credentials');
        }

        try {
          const { productid } = req.params;
      
          const productIdCheck = parseInt(productid);
          if (productIdCheck != productid) {
            logger.error("Bad Request: Invalid Product Id");
            return res.status(400).send({
              error: "Bad Request: Invalid Product Id",
            });
          }
      
          if (await authUser(req, productid)) {
            const images = await Images.findAll({
              where: { product_id: productid },
            });
            if (images) {
              logger.info(images);
              res.json(images);
            } else {
              logger.error("Images not found");
              res.status(404).json({ message: "Images not found" });
            }
          } else {
            logger.error("You are not authorized to view images of this product.");
            return res.status(403).json({
              message: "You are not authorized to view images of this product.",
            });
          }
        } catch (error) {
          logger.error("Failed to get product images");
          res.status(400).json({ message: "Failed to get product images" });
        }
      }};
  
  const deleteImage = async (req, res, next) => {
    sdc.increment('delete/image');
    const auth = req.headers.authorization;
    if (!auth || auth.indexOf('Basic ') === -1)
    {
      logger.error("Forbidden Request");
      return res.status(403).json("Forbidden Request")
    }
    const base64Credentials = auth.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [usernamegetting, passwordgetting] = credentials.split(':');
    if (!usernamegetting || !passwordgetting) {
        logger.error("Invalid Authentication Details");
        return res.status(403).json("Invalid Authentication Details");
    }
    const usr = await db.user.findOne({ where: { username: usernamegetting } })
    if (usr === null) {
       logger.error("Invalid Authentication Details");
        return res.status(400).json('Invalid Authentication Details');
    }
    else {
        let passcheck = false;
        const passwordstoreduser = usr.password;
        // var hashedPassword = await bcrypt.hash(passwordstoreduser, 10);
        if (await bcrypt.compare(passwordgetting, passwordstoreduser)) {
            passcheck = true;
        }
        if (passcheck == false) {
           logger.error("Invalid Credentials");
            return res.status(401).json('Invalid Credentials');
        }

        try {
          const { productid, imageid } = req.params;
      
          const productIdCheck = parseInt(productid);
          if (productIdCheck != productid) {
            logger.error("Bad Request: Invalid Product Id");
            return res.status(400).send({
              error: "Bad Request: Invalid Product Id",
            });
          }
      
          const id = req.params.imageid;
          const imgIdCheck = parseInt(id);
          if (imgIdCheck != id) {
            logger.error("Bad Request: Invalid Image Id");
            return res.status(400).send({
              error: "Bad Request: Invalid Image Id",
            });
          }
      
          if (await authUser(req, productid)) {
          
            const image = await Images.findOne({
              where: { image_id: imageid, product_id: productid },
            });
           
            if (!image) {
              logger.error("Image not found");
              res.status(404).json({ message: "Image not found" });
            } else {
              var url = image.s3_bucket_path;
              var filename = url.split('/').pop();
              console.log(filename);
              const params = {
                Bucket: process.env.BUCKET_NAME,
                Key: filename,
              };
              const data = await s3.send(
                new DeleteObjectCommand(params)
              );
              await image.destroy();
              logger.info("Image deleted successfully");
              res.status(204).json({ message: "Image deleted successfully" });
            }
          } else {
            logger.error("You are not authorized to delete images of this product.");
            return res.status(403).json({
              message: "You are not authorized to delete images of this product.",
            });
          }
        } catch (error) {
          logger.error("Failed to delete image");
          res.status(400).json({ message: "Failed to delete image" });
        }
      }};
  
  module.exports = { addImage, getImage, getAllImages, deleteImage };
  