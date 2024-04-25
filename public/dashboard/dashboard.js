const roleElement = document.getElementById("role")
const classesElement = document.getElementById("classes")

const userEditPopup = document.getElementById("user-edit-popup")
const classEditPopup = document.getElementById("class-edit-popup")
const userAddPopup = document.getElementById("user-add-popup")

const deleteUserSelect = document.getElementById("delete-user-select")



async function request(path, data = {}) {
    const response = await fetch(path, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(data)
    })

    return response.json()
}

async function removeClass(id) {
    const response = await request("/class/delete", { id })


    if (response) location.reload()
}

async function removeUserFromClass(userId, classId) {
    console.log(userId, classId)
    const response = await request("/class/removeUser", { userId, classId })

    if (response) location.reload()
}

async function getClasses() {
    classesElement.innerHTML = ""

    const classes = await request("/class/getAvailable")

    for (const classData of classes) {
        console.log(classData)
        const newClassElement = `
            <div class="class">
                <div class="class-head">
                    <h2>${classData.name}</h2>

                    <div class="class-buttons">
                        <button class="admin-only" onclick="openUserAddPopup('${classData.id}')">Add user</button>
                        <button class="teacher-only" onclick="openClassEditPopup('${classData.id}')">Edit</button>
                        <button class="admin-only" onclick="removeClass('${classData.id}')">Remove</button>
                        <p>Students: ${classData.users.length}</p>
                    </div>
                </div>

                ${classData.users.map(userOnClass => `
                    <div class="user-on-class">
                        <div>
                            <p><strong>${userOnClass.user.name}(${userOnClass.user.role})</strong></p>
                            -
                            <p><strong>${userOnClass.user.email}</strong></p>
                            -
                            <p><strong>${userOnClass.title}</strong></p>
                        </div>
                        
                        <div>
                            <button class="teacher-only" onclick="removeUserFromClass('${userOnClass.userId}', '${classData.id}')">Remove</button>
                            <button 
                                class="teacher-only" 
                                onclick="openUserEditPopup('${userOnClass.userId}', '${classData.id}', ${(userOnClass.title ? `'${userOnClass.title}'` : null)}, ${(userOnClass.notes ? `'${encodeURIComponent(userOnClass.notes)}'` : null)})"
                            >View</button>
                        </div>
                    </div>
                `).join("")}
            </div>
        `

        classesElement.innerHTML += newClassElement
    }


    const users = await request("/user/getAll")

    deleteUserSelect.innerHTML = users.map(user => `
        <option value="${user.id}">${user.name} - ${user.email}</option>
    `).join("")
}

async function getSelf() {
    const self = await request("/user/self")

    roleElement.innerText = `(${self.role})`

    const adminOnly = document.getElementsByClassName("admin-only")
    const teacherOnly = document.getElementsByClassName("teacher-only")

    if (self.role === "ADMIN") {
        for (const element of adminOnly) {
            element.style.display = "flex"
        }
    }

    if (self.role === "TEACHER" || self.role === "ADMIN") {
        for (const element of teacherOnly) {
            element.style.display = "flex"
        }
    }
}




async function init() {
    await getClasses()
    await getSelf()
}

init()



































function closeClassEditPopup() {
    classEditPopup.style.display = "none"
}

function closeUserEditPopup() {
    userEditPopup.style.display = "none"
}

function closeUserAddPopup() {
    userAddPopup.style.display = "none"
}



function openClassEditPopup(classId) {
    classEditPopup.style.display = "flex"


    document.getElementById("edit-classId").value = classId
}

async function openUserAddPopup(classId) {
    userAddPopup.style.display = "flex"

    document.getElementById("add-classId").value = classId

    const users = await request("/class/getAvailableUsers", {
        id: classId
    })

    document.getElementById("users-select").innerHTML = users.map(user => `
        <option value="${user.id}">${user.name} - ${user.email}</option>
    `).join("")
}


function openUserEditPopup(userId, classId, title, encodeNotes) {
    console.log(userId, classId)
    userEditPopup.style.display = "flex"

    document.getElementById("edit-user-classId").value = classId
    document.getElementById("edit-user-userId").value = userId

    document.getElementById("edit-user-title").value = title ?? ""
    document.getElementById("edit-user-notes").value = encodeNotes ? decodeURIComponent(encodeNotes) : ""
}
