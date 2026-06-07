import { useState, useEffect } from 'react'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'

export const useBranch = () => {
  const { user } = useAuth()
  const [branch, setBranch] = useState(null)
  const [allBranches, setAllBranches] = useState([])

  useEffect(() => {
    if (user?.branchId) {
      getDoc(doc(db, 'branches', user.branchId)).then(snap => {
        if (snap.exists()) setBranch({ id: snap.id, ...snap.data() })
      })
    }
    if (user?.role === 'system_admin') {
      getDocs(collection(db, 'branches')).then(snap => {
        setAllBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      })
    }
  }, [user])

  return { branch, allBranches }
}
