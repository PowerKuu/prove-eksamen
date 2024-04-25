import express from "express"
import cookieParser from "cookie-parser"
import { join } from "path"

import { Class, PrismaClient, Role, User } from "@prisma/client"
import crypto from "crypto"

interface UserWithClasses extends User {
    classes: Class[]
}

const app = express()
const prisma = new PrismaClient()
const port = process.env.PORT || 3000

app.use(express.json())
app.use(cookieParser())

app.use((req, res, next) => {
    if (req.path === "/") return next()

    const token: string | null = req.cookies.token

    if (!token) return res.redirect("/")
    
    const user = prisma.user.findUnique({
        where: {
            token: token
        },

        include: {
            classes: true
        }
    })

    if (!user) return res.redirect("/")
    
    res.locals.user = user
    next()
})


app.use(express.static(join(__dirname, "public")))


app.post("/user/login", async (req, res) => {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
        where: {
            email: email
        }
    })

    const passwordHash = crypto.createHash("sha256").update(password).digest("hex")

    if (!user) return res.status(404).json({ error: "User not found" })
    
    if (!user.password) {
        await prisma.user.update({
            where: {
                email: email
            },
            data: {
                password: passwordHash
            }
        })
    }
    else if (user.password !== passwordHash) {
        return res.status(401).json({ error: "Invalid password" })
    }

    res.cookie("token", user.token)
    res.redirect("/dashboard")
})

app.post("/user/create", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const user: UserWithClasses = req.body
    const userExists = await prisma.user.findUnique({
        where: {
            email: user.email
        }
    })

    if (userExists) return res.status(400).json({ error: "User already exists" })

    const newUser = await prisma.user.create({
        data: {
            email: user.email,
            name: user.name
        }
    })

    res.json(newUser)
})

app.post("/user/update", async (req, res) => {
    const self: UserWithClasses = res.locals.user

        
    const { id, user }: {
        id: string
        user: Partial<{
            name: string,
            title: string,
            phone: string,
            role: Role,
        }>
    } = req.body

    if (id !== self.id && self.role !== Role.ADMIN) { 
        return res.status(403).json({ error: "Unauthorized" })
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: id
        },

        data: {
            name: user.name,
            title: user.title,
            phone: user.phone,
            role: self.role == Role.ADMIN ? user.role : self.role,
        }
    })

    res.json(updatedUser)
})

app.get("/user/delete", async (req, res) => {
    const self: User = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const { id } = req.query

    const deletedUser = await prisma.user.delete({
        where: {
            id: id as string
        }
    })

    res.json(deletedUser)
})

app.get("/user/getAll", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const users = await prisma.user.findMany()

    res.json(users)
})




app.post("/class/delete", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const id: string = req.body.id

    const deletedClass = await prisma.class.delete({
        where: { id }
    })

    res.json(deletedClass)
})

app.post("/class/create", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const { name, description } = req.body

    const newClass = await prisma.class.create({
        data: {
            name,
            description
        }
    })

    res.json(newClass)
})

app.post("/class/update", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const id = req.body.id

    const { name, description }: {
        name: string,
        description: string
    } = req.body.newClass

    if (self.role == Role.TEACHER && self.classes.find(selfClass => selfClass.id !== id)) {
        return res.status(400).json({ error: "Unauthorized" })
    }

    const updatedClass = await prisma.class.update({
        where: {
            id: id
        },

        data: { name, description }
    })

    res.json(updatedClass)
})

app.get("/class/getAvailable", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.ADMIN) {
        return res.json(await prisma.class.findMany({
            include: {
                users: true
            }
        }))
    }

    if (self.role === Role.TEACHER || self.role === Role.STUDENT) {
        return res.json(await prisma.class.findMany({
            where: {
                users: {
                    some: {
                        id: self.id
                    }
                }
            },

            include: {
                users: {
                    select: {
                        notes: self.role === Role.TEACHER,
                        title: true,
                    }
                }
            }
        }))
    }
})





app.post("/class/addUser", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const { userId, classId } = req.body

    if (self.role == Role.TEACHER && self.classes.find(selfClass => selfClass.id !== classId)) {
        return res.status(400).json({ error: "Unauthorized" })
    }

    const userOnClass = await prisma.userOnClass.create({
        data: {
            user: {
                connect: {
                    id: userId
                }
            },

            class: {
                connect: {
                    id: classId
                }
            }
        }
    })

    res.json(userOnClass)
})

app.post("/class/updateUser", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const userId: string = req.body.userId
    const classId: string = req.body.classId

    const { user }: {
        user: Partial<{
            notes: string,
            title: string
        }>
    } = req.body

    if (self.role == Role.TEACHER && self.classes.find(selfClass => selfClass.id !== classId)) {
        return res.status(400).json({ error: "Unauthorized" })
    }

    await prisma.userOnClass.updateMany({
        where: {
            userId: userId,
            classId: classId
        },

        data: {
            notes: user.notes,
            title: user.title
        }
    })

    res.json({ success: true })
})

app.post("/class/removeUser", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const userId: string = req.body.userId
    const classId: string = req.body.classId

    if (self.role == Role.TEACHER && self.classes.find(selfClass => selfClass.id !== classId)) {
        return res.status(400).json({ error: "Unauthorized" })
    }

    await prisma.userOnClass.deleteMany({
        where: {
            userId: userId,
            classId: classId
        }
    })

    res.json({ success: true })
})






app.get("/logout", (req, res) => {
    res.clearCookie("token")
    res.redirect("/")
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})