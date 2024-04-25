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
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

const allowedPaths = ["/", "favicon.ico", "/global.css", "/user/login"]

app.use(async (req, res, next) => {
    if (allowedPaths.includes(req.path)) return next()


    const token: string | null = req.cookies.token

    if (!token) return res.redirect("/")
    
    const user = await prisma.user.findUnique({
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

    if (!email || !password) return res.status(400).redirect("/")

    const user = await prisma.user.findUnique({
        where: {
            email: email
        }
    })

    const passwordHash = crypto.createHash("sha256").update(password).digest("hex")

    if (!user) return res.status(404).redirect("/")
    
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
        return res.status(401).redirect("/")
    }

    res.cookie("token", user.token)
    res.redirect("/dashboard")
})

app.get("/user/logout", (req, res) => {
    res.clearCookie("token")
    res.redirect("/")
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

    await prisma.user.create({
        data: {
            email: user.email,
            name: user.name,
            role: user.role
        }
    })

    res.redirect("/dashboard")
})

app.post("/user/update", async (req, res) => {
    const self: UserWithClasses = res.locals.user
        
    const { id, user }: {
        id: string
        user: Partial<{
            name: string,
            password: string,
            role: Role,
        }>
    } = req.body

    if (id !== self.id && self.role !== Role.ADMIN) { 
        return res.status(403).json({ error: "Unauthorized" })
    }

    const newPassword = user.password ? crypto.createHash("sha256").update(user.password).digest("hex") : undefined

    const updatedUser = await prisma.user.update({
        where: {
            id: id
        },

        data: {
            name: user.name,
            password: newPassword,

            role: self.role == Role.ADMIN ? user.role : self.role,
        }
    })

    res.json(updatedUser)
})

app.post("/user/delete", async (req, res) => {
    const self: User = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const { id } = req.body

    await prisma.user.delete({
        where: {
            id: id as string
        }
    })

    res.redirect("/dashboard")
})

app.post("/user/getAll", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const users = await prisma.user.findMany()

    res.json(users)
})

app.post("/user/self", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    res.json(self)
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

    const { name } = req.body

    await prisma.class.create({
        data: {
            name,
        }
    })

    res.redirect("/dashboard")
})

app.post("/class/update", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const id = req.body.id
    const name: string = req.body.name

    if (self.role == Role.TEACHER && !self.classes.find(selfClass => selfClass.id !== id)) {
        return res.status(400).json({ error: "Unauthorized" })
    }

    await prisma.class.update({
        where: {
            id: id
        },

        data: { name }
    })

    res.redirect("/dashboard")
})

app.post("/class/getAvailable", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    return res.json(await prisma.class.findMany({
        where: self.role === Role.ADMIN ? {} : {
            users: {
                some: {
                    userId: self.id
                }
            }
        },

        include: {
            users: {
                select: {
                    notes: self.role !== Role.STUDENT,
                    title: true,

                    classId: true,
                    userId: true,
                    
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true
                        }
                    }
                }
            }
        }
    }))

})

app.post("/class/getAvailableUsers", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const id: string = req.body.id

    const users = await prisma.user.findMany({
        where: {
            classes: {
                none: {
                    classId: id
                }
            }
        }
    })

    res.json(users)
})





app.post("/class/addUser", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role !== Role.ADMIN) return res.status(403).json({ error: "Unauthorized" })

    const { userId, classId } = req.body

    await prisma.userOnClass.create({
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

    res.redirect("/dashboard")
})

app.post("/class/updateUser", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const { notes, title, userId, classId }: {
        userId: string,
        classId: string,

        notes: string,
        title: string
    } = req.body

    if (self.role == Role.TEACHER && !self.classes.find(selfClass => selfClass.id !== classId)) {
        return res.status(400).json({ error: "Unauthorized" })
    }

    await prisma.userOnClass.updateMany({
        where: {
            userId: userId,
            classId: classId
        },

        data: {
            notes: notes,
            title: title
        }
    })

    res.redirect("/dashboard")
})

app.post("/class/removeUser", async (req, res) => {
    const self: UserWithClasses = res.locals.user

    if (self.role === Role.STUDENT) return res.status(403).json({ error: "Unauthorized" })

    const userId: string = req.body.userId
    const classId: string = req.body.classId

    if (self.role == Role.TEACHER && !self.classes.find(selfClass => selfClass.id !== classId)) {
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




app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})